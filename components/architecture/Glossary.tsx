"use client";
import { Details, SectionHead } from "./shared";

const ITEMS: [string, string][] = [
  ["What is an API?", "An API is a way for one program to ask another program for something. Genesis Lab sends a question to an AI company's API and gets an answer back, like placing an order and receiving a meal."],
  ["What is a model?", "A model is the AI system that actually writes the answer. A company can offer several models: some faster, some more capable. The model ID is its exact name."],
  ["What does an API key do?", "It is a secret password that proves to the AI company that the request is ours, and lets them count and bill our usage. Keys stay on the server and are never sent to your browser."],
  ["What does the router do?", "The router is the traffic controller. For each request it picks a provider and a key, sends the request, and decides what to do if the answer does not come back."],
  ["What is key rotation?", "Each key has usage limits. With several keys, the router takes turns, and rests any key that hits its limit. That spreads the load and keeps the app working."],
  ["What is a fallback provider?", "A backup. If the main provider cannot answer, the router asks a second provider instead. It only works if the second provider is really configured."],
  ["What does validation do?", "Checks before and after. Inputs are checked before they are used, and AI answers are checked against the expected format before they are shown. A bad answer triggers a retry, not a guess."],
  ["How do results reach me?", "The server returns the validated result to the page, and the experiment turns it into the 3D scene, charts and explanations you see."],
];

export function Glossary() {
  return (
    <section aria-labelledby="plain" className="scroll-mt-24">
      <SectionHead id="plain" eyebrow="Plain English" title="The ideas, without the jargon" lead="Click any question for a short explanation." />
      <div className="grid gap-3 md:grid-cols-2">
        {ITEMS.map(([q, a]) => <Details key={q} summary={q}>{a}</Details>)}
      </div>
    </section>
  );
}
