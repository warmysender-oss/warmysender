import net from "node:net";
import { describe, expect, it } from "vitest";
import { buildOutgoingEmail, buildRawMessage } from "./send-message.js";

describe("SMTP catcher threading", () => {
  it("shows In-Reply-To and References on a follow-up and not on step 1", async () => {
    const received = await deliver(buildStep(1), buildStep(2));
    expect(received).toHaveLength(2);
    const first = received[0] ?? "";
    const second = received[1] ?? "";
    expect(first).toContain("Subject: Quick question");
    expect(first).not.toContain("In-Reply-To:");
    expect(first).not.toContain("References:");
    expect(first).toContain("List-Unsubscribe: <https://app.example.test/u/tok_1>");
    expect(first).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(first.toLowerCase()).not.toContain("mailto:");

    expect(second).toContain("Subject: Re: Quick question");
    expect(second).toContain("In-Reply-To: <step-1@harbor-dental.test>");
    expect(second).toContain("References: <step-1@harbor-dental.test>");
    expect(second).toContain("Message-ID: <step-2@harbor-dental.test>");
    expect(second).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  });
});

function buildStep(step: 1 | 2): string {
  const built = buildOutgoingEmail({
    stepNumber: step,
    stepSubject: step === 1 ? "Quick question" : null,
    previousMessageId: step === 1 ? null : "<step-1@harbor-dental.test>",
    previousReferences: null,
    previousSubject: step === 1 ? null : "Quick question",
    fromAddress: "ada@harbor-dental.test",
    fromName: "Ada",
    toAddress: "jane@harbor-dental.test",
    toName: "Jane",
    bodyText: "Hello {{unsubscribe_link}}",
    bodyHtml: null,
    publicUrl: "https://app.example.test",
    unsubscribeToken: "tok_1",
    messageId: step === 1 ? "<step-1@harbor-dental.test>" : "<step-2@harbor-dental.test>",
  });
  if (!built.ok) throw new Error(built.reason);
  return buildRawMessage(built.email, new Date("2026-01-15T12:00:00.000Z"));
}

async function deliver(...raws: string[]): Promise<string[]> {
  const messages: string[] = [];
  const server = net.createServer((socket) => {
    let mode: "command" | "data" = "command";
    let buffer = "";
    let data = "";
    socket.write("220 localhost ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (buffer.length) {
        if (mode === "data") {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) {
            data += buffer;
            buffer = "";
            return;
          }
          data += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          messages.push(unstuff(data));
          data = "";
          mode = "command";
          socket.write("250 ok\r\n");
          continue;
        }
        const end = buffer.indexOf("\r\n");
        if (end === -1) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) socket.write("250 localhost\r\n");
        else if (upper.startsWith("MAIL FROM") || upper.startsWith("RCPT TO")) socket.write("250 ok\r\n");
        else if (upper === "DATA") {
          mode = "data";
          socket.write("354 go\r\n");
        } else if (upper === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("250 ok\r\n");
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("catcher did not bind");
  try {
    for (const raw of raws) {
      await smtpSend(address.port, raw);
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  return messages;
}

function unstuff(data: string): string {
  return data
    .split("\r\n")
    .map((line) => (line.startsWith("..") ? line.slice(1) : line))
    .join("\r\n");
}

function smtpSend(port: number, raw: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const steps = [
      "EHLO warmysender.local\r\n",
      "MAIL FROM:<ada@harbor-dental.test>\r\n",
      "RCPT TO:<jane@harbor-dental.test>\r\n",
      "DATA\r\n",
    ];
    let step = 0;
    let buffer = "";
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(5000, () => fail(new Error("smtp catcher timed out")));
    socket.on("error", fail);
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (!buffer.endsWith("\n")) return;
      const lines = buffer.trim().split(/\r\n/);
      buffer = "";
      const last = lines[lines.length - 1] ?? "";
      if (/^\d{3}-/.test(last)) return;
      const code = Number(last.slice(0, 3));
      if (code >= 400) return fail(new Error(last));
      if (step < steps.length) {
        const command = steps[step];
        step += 1;
        if (command) socket.write(command);
        return;
      }
      if (step === steps.length) {
        step += 1;
        const body = raw.endsWith("\r\n") ? raw : `${raw}\r\n`;
        socket.write(`${body}.\r\n`);
        return;
      }
      socket.end("QUIT\r\n");
      resolve();
    });
  });
}
