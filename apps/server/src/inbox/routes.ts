import { eq } from "drizzle-orm";
import { Router } from "express";
import { inboundMessages, replyDrafts, type AppDatabase, type Config } from "@warmysender/core";
import { HttpError } from "../http.js";
import { requireUser } from "../middleware.js";
import { applyInterest, type Interest } from "./interest.js";
import { findContact, findInbound, findMailbox, listInboxThreads } from "./queries.js";
import { nodemailerTransport, type ReplyTransport } from "./send-reply.js";
import { buildThreadReply } from "./thread-reply.js";

function presentThread(thread: Awaited<ReturnType<typeof listInboxThreads>>[number]) {
  return {
    key: thread.key,
    mailboxId: thread.mailboxId,
    contactId: thread.contactId,
    subject: thread.subject,
    latestAt: thread.latestAt,
    badge: thread.badge,
    interest: thread.interest,
    messages: thread.messages.map((message) => ({
      id: message.id,
      at: message.at,
      direction: message.direction,
      subject: message.subject,
      from: message.from,
      bodyText: message.bodyText,
      kind: message.kind,
      interest: message.interest,
    })),
  };
}

export function inboxRouter(db: AppDatabase, config: Config, transport: ReplyTransport = nodemailerTransport(config)): Router {
  const router = Router();
  router.use(requireUser);

  router.get("/", async (_req, res, next) => {
    try {
      const threads = await listInboxThreads(db);
      res.json({ threads: threads.map(presentThread) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/threads/:mailboxId/:contactId", async (req, res, next) => {
    try {
      const mailboxId = req.params.mailboxId;
      const contactId = req.params.contactId;
      if (!mailboxId || !contactId) throw new HttpError(400, "Mailbox and contact are required.");
      const threads = await listInboxThreads(db);
      const thread = threads.find((item) => item.mailboxId === mailboxId && item.contactId === contactId);
      if (!thread) throw new HttpError(404, "Thread not found.");
      res.json({ thread: presentThread(thread) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/messages/:id/interest", async (req, res, next) => {
    try {
      const id = req.params.id;
      if (!id) throw new HttpError(400, "Message id is required.");
      const interest = req.body?.interest;
      if (interest !== "interested" && interest !== "not_interested") {
        throw new HttpError(400, "Interest must be interested or not_interested.");
      }
      const message = await findInbound(db, id);
      if (!message) throw new HttpError(404, "Message not found.");
      try {
        applyInterest(message.kind, interest as Interest);
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : "Interest is not allowed.");
      }
      await db.update(inboundMessages).set({ interest }).where(eq(inboundMessages.id, id));
      res.json({ id, interest });
    } catch (error) {
      next(error);
    }
  });

  router.post("/threads/:mailboxId/:contactId/reply", async (req, res, next) => {
    try {
      const mailboxId = req.params.mailboxId;
      const contactId = req.params.contactId;
      if (!mailboxId || !contactId) throw new HttpError(400, "Mailbox and contact are required.");
      const bodyText = typeof req.body?.body === "string" ? req.body.body : "";
      const threads = await listInboxThreads(db);
      const thread = threads.find((item) => item.mailboxId === mailboxId && item.contactId === contactId);
      if (!thread) throw new HttpError(404, "Thread not found.");
      const mailbox = await findMailbox(db, mailboxId);
      const contact = await findContact(db, contactId);
      if (!mailbox || !contact) throw new HttpError(404, "Thread not found.");
      let draft;
      try {
        draft = buildThreadReply({
          mailboxId: mailbox.id,
          mailboxEmail: mailbox.email,
          contactEmail: contact.email,
          messages: thread.messages,
          bodyText,
        });
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : "Could not build the reply.");
      }
      let sent: { messageId: string };
      try {
        sent = await transport({ mailbox, draft });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not send the reply.";
        throw new HttpError(502, message === "Reconnect this mailbox before replying." ? message : "Could not send the reply.");
      }
      await db.insert(replyDrafts).values({
        inboundMessageId: [...thread.messages].reverse().find((message) => message.direction === "in")?.id ?? null,
        enrollmentId: null,
        mailboxId: mailbox.id,
        body: draft.bodyText,
        status: "sent",
        sentMessageId: sent.messageId,
      });
      res.status(201).json({
        mailboxId: draft.mailboxId,
        to: draft.to,
        subject: draft.subject,
        inReplyTo: draft.inReplyTo,
        references: draft.references,
        messageId: sent.messageId,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
