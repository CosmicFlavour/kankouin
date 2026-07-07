import { Button } from "@/components/ui/button";

function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="text-2xl font-semibold">Kankouin</h1>
      <p className="text-muted-foreground">
        Frontend scaffold — shadcn/ui + Tailwind wired up.
      </p>
      <Button>It works</Button>
    </main>
  );
}

export default App;
