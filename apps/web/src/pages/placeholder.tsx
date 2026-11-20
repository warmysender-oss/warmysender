import { Card } from "@/components/ui/card";

export function PlaceholderPage({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card className="mt-6 p-6">
        <p className="text-sm text-muted-foreground">{body}</p>
      </Card>
    </div>
  );
}
