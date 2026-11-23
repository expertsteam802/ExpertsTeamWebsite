import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Lightbulb } from "lucide-react";

import { LearningCodePlayground } from "@/components/learning-code-playground";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/learn/lesson/$lessonId")({
  head: ({ params }) => ({
    meta: [
      { title: "Coding lesson | ExpertsTeam" },
      { name: "description", content: "A practical step-by-step coding lesson with examples and a live HTML, CSS and JavaScript workspace." },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: `https://expertsteam.giize.com/learn/lesson/${params.lessonId}` }],
  }),
  component: CodingLessonPage,
});

const lessons = [
  {
    id: "1",
    title: "How code actually runs",
    summary: "Understand programs, instructions and the tools used to write code.",
    concept: "A program is a set of instructions. The browser reads HTML to understand the page structure, CSS to style it, and JavaScript to make it interactive. The browser executes JavaScript statements in order, while events let your code respond to user actions.",
    example: `const message = "Hello, ExpertsTeam";
console.log(message);

const button = document.querySelector("button");
button?.addEventListener("click", () => {
  console.log("The button was clicked!");
});`,
    task: "Create a button in the learning workspace. When it is clicked, change a paragraph to say that your first program is running.",
    takeaway: "Write a small instruction, run it, observe the result, then improve it. Debugging is part of programming.",
  },
  {
    id: "2",
    title: "Variables and data",
    summary: "Store and work with numbers, text, true/false values and lists.",
    concept: "Variables give names to values. Use const when you do not reassign a variable and let when its value needs to change. Common data types include strings, numbers, booleans, arrays and objects.",
    example: `const learner = "Chris";
let completedLessons = 1;
const isLearning = true;
const topics = ["HTML", "CSS", "JavaScript"];

completedLessons += 1;
console.log(learner, completedLessons, isLearning, topics);`,
    task: "Create variables for your name, your current lesson number and three technologies you want to learn. Display them on the page.",
    takeaway: "Choose clear variable names and the simplest data type that represents the information.",
  },
  {
    id: "3",
    title: "Logic and loops",
    summary: "Make decisions with conditions and repeat work with loops.",
    concept: "Conditional statements run different code depending on a condition. Loops repeat a block of code. A for loop is useful when you know how many times to repeat; for...of is useful when processing each item in a list.",
    example: `const scores = [72, 88, 45, 96];

for (const score of scores) {
  if (score >= 80) {
    console.log(score + " — great work");
  } else if (score >= 50) {
    console.log(score + " — keep practising");
  } else {
    console.log(score + " — review this topic");
  }
}`,
    task: "Create a list of five scores and display whether each score is a pass or needs more practice.",
    takeaway: "Check boundary cases and make sure every possible condition has a sensible outcome.",
  },
  {
    id: "4",
    title: "Functions and reuse",
    summary: "Package repeated work into reusable, understandable functions.",
    concept: "A function is a reusable block of code. It can receive inputs called parameters and send a result back with return. Small functions are easier to test and combine.",
    example: `function calculateTotal(price, quantity) {
  return price * quantity;
}

function formatMoney(amount) {
  return "$" + amount.toFixed(2);
}

const total = calculateTotal(4.5, 3);
console.log(formatMoney(total));`,
    task: "Write a function that converts a temperature from Celsius to Fahrenheit, then show the result for three temperatures.",
    takeaway: "Give functions one clear responsibility, name them by what they do, and return values instead of relying on hidden side effects.",
  },
  {
    id: "5",
    title: "Build a real web app",
    summary: "Combine HTML structure, CSS design and JavaScript interaction.",
    concept: "HTML describes content and semantic structure. CSS controls layout, spacing, typography and responsive behaviour. JavaScript handles events and updates the page. A useful app starts with a small working feature before adding complexity.",
    example: `const form = document.querySelector("form");
const input = document.querySelector("input");
const list = document.querySelector("ul");

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = input?.value.trim();
  if (!value || !list) return;

  const item = document.createElement("li");
  item.textContent = value;
  list.append(item);
  if (input) input.value = "";
});`,
    task: "Build a small task list with an input, an Add button and a visible list. Make it comfortable to use on a phone.",
    takeaway: "Keep structure, styling and behaviour understandable. Test keyboard use and small screens as well as desktop.",
  },
  {
    id: "6",
    title: "Databases and the web",
    summary: "Learn how apps communicate with servers, APIs and databases.",
    concept: "A browser sends requests to a server using HTTP. An API defines how the client and server exchange data. A database stores information so it can be retrieved later. Authentication identifies a user, while authorization decides what that user is allowed to do.",
    example: `async function loadPosts() {
  const response = await fetch("/api/posts");

  if (!response.ok) {
    throw new Error("Could not load posts");
  }

  const posts = await response.json();
  console.log(posts);
}

loadPosts().catch((error) => console.error(error));`,
    task: "Sketch a simple notes app: decide what fields each note needs, who owns each note, and which operations a signed-in user should be allowed to perform.",
    takeaway: "Never trust browser input for permissions. Enforce access rules on the server and database, and keep secrets out of frontend code.",
  },
] as const;

function CodingLessonPage() {
  const { lessonId } = Route.useParams();
  const lesson = lessons.find((item) => item.id === lessonId);
  const index = lesson ? lessons.findIndex((item) => item.id === lesson.id) : -1;
  const previous = index > 0 ? lessons[index - 1] : null;
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;

  if (!lesson) {
    return (
      <PageShell>
        <main className="mx-auto max-w-4xl px-4 py-16">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold">Lesson not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">Choose a lesson from the ExpertsTeam learning path.</p>
            <Button asChild className="mt-5"><a href="/learn">Back to learning</a></Button>
          </Card>
        </main>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <a href="/learn" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All learning
        </a>
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Coding path · Lesson {lesson.id} of 6</p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{lesson.title}</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">{lesson.summary}</p>
        </header>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-5">
            <Card className="gap-3 p-5 sm:p-6">
              <div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /><h2 className="font-semibold">Understand the idea</h2></div>
              <p className="text-sm leading-7 text-muted-foreground">{lesson.concept}</p>
            </Card>
            <Card className="gap-3 p-5 sm:p-6">
              <h2 className="font-semibold">Example code</h2>
              <pre className="overflow-x-auto rounded-xl bg-[#0b1220] p-4 text-xs leading-6 text-slate-100"><code>{lesson.example}</code></pre>
            </Card>
            <Card className="gap-3 p-5 sm:p-6">
              <div className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-amber-500" /><h2 className="font-semibold">Try it yourself</h2></div>
              <p className="text-sm leading-7 text-muted-foreground">{lesson.task}</p>
              <LearningCodePlayground floating={false} />
            </Card>
            <Card className="gap-3 p-5 sm:p-6">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" /><h2 className="font-semibold">Remember</h2></div>
              <p className="text-sm leading-7 text-muted-foreground">{lesson.takeaway}</p>
            </Card>
          </div>
          <aside className="h-fit rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 lg:sticky lg:top-24">
            <h2 className="font-semibold">Your learning path</h2>
            <ol className="mt-4 space-y-2">
              {lessons.map((item) => (
                <li key={item.id}>
                  <a href={`/learn/lesson/${item.id}`} aria-current={item.id === lesson.id ? "step" : undefined} className={`block rounded-lg px-3 py-2 text-sm ${item.id === lesson.id ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                    {item.id}. {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </aside>
        </div>
        <nav className="mt-8 flex flex-wrap justify-between gap-3 border-t border-border pt-5">
          {previous ? <Button asChild variant="outline"><a href={`/learn/lesson/${previous.id}`}><ArrowLeft className="mr-2 h-4 w-4" /> Previous lesson</a></Button> : <span />}
          {next ? <Button asChild><a href={`/learn/lesson/${next.id}`}>Next lesson <ArrowRight className="ml-2 h-4 w-4" /></a></Button> : <Button asChild><a href="/learn">Finish learning path</a></Button>}
        </nav>
      </main>
    </PageShell>
  );
}
