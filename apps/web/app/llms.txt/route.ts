import { llmsText } from "../../lib/llms";

/** `/llms.txt` gerado no build (estático): o conteúdo sai de `lib/about.ts`, a fonte única de `/o-que-e`. */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(llmsText(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
