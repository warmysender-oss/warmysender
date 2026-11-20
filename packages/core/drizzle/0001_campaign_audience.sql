CREATE TABLE "campaign_audience_contacts" (
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_audience_contacts_campaign_id_contact_id_pk" PRIMARY KEY("campaign_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_audience_lists" (
	"campaign_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_audience_lists_campaign_id_list_id_pk" PRIMARY KEY("campaign_id","list_id")
);
--> statement-breakpoint
ALTER TABLE "campaign_audience_contacts" ADD CONSTRAINT "campaign_audience_contacts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audience_contacts" ADD CONSTRAINT "campaign_audience_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audience_lists" ADD CONSTRAINT "campaign_audience_lists_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audience_lists" ADD CONSTRAINT "campaign_audience_lists_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;