import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, FileText, GraduationCap, Video } from "lucide-react";

import { AddVideoDialog } from "@/components/add-video-dialog";
import { FileGrid, type CommunityFile } from "@/components/file-grid";
import { PageShell } from "@/components/layout/page-shell";
import { UploadDialog } from "@/components/upload-dialog";
import { VideoGrid, type VideoItem } from "@/components/video-grid";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Learn to Code — Become a Pro Coder | ExpertsTeam" },
      {
        name: "description",
        content:
          "Learn to code, become a pro coder, and study programming through beginner-friendly lessons, books, files and videos.",
      },
      { property: "og:title", content: "Learn to Code — Become a Pro Coder" },
      {
        property: "og:description",
        content: "Learn programming through coding lessons, books, videos and practical resources.",
      },
    ],
    links: [{ rel: "canonical", href: "https://expertsteam.giize.com/learn" }],
  }),
  component: LearnPage,
});

const LESSONS = [
  {
    title: "1 · How code actually runs",
    body: "What a program is, how the computer reads instructions top to bottom, and how to set up your editor.",
  },
  {
    title: "2 · Variables & data",
    body: "Numbers, text, booleans and lists — the boxes every app stores its information in.",
  },
  {
    title: "3 · Logic & loops",
    body: "if/else decisions and loops that repeat work for you, with small practice challenges.",
  },
  {
    title: "4 · Functions & reuse",
    body: "Wrap logic into functions so your project stays small, readable and easy to fix.",
  },
  {
    title: "5 · Building a real app",
    body: "HTML, CSS and JavaScript together: layout, styling and interaction in one small project.",
  },
  {
    title: "6 · Databases & the web",
    body: "How apps save data, log people in and talk to a server — the ideas behind this very site.",
  },
];

const SECTIONS = [
  { id: "library", label: "Books & files", icon: BookOpen, hint: "Read and download resources" },
  { id: "videos", label: "Learning videos", icon: Video, hint: "Watch tutorials and walkthroughs" },
  {
    id: "lessons",
    label: "Coding lessons",
    icon: GraduationCap,
    hint: "Learn the foundations step by step",
  },
] as const;

function LearnPage() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("library");
  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["files", "learn-library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("files")
        .select("*, profiles(username, display_name)")
        .in("category", ["book", "lesson", "resource", "file"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CommunityFile[];
    },
  });
  const { data: videos = [], isLoading: videosLoading } = useQuery({
    queryKey: ["videos", "learn"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos")
        .select("*, profiles(username, display_name)")
        .eq("category", "lesson")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as VideoItem[];
    },
  });

  return (
    <PageShell>
      <section className="hero-surface border-b border-border/60 px-4 py-10 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Your learning space
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-5xl">
            Learn to <span className="brand-text">code</span>
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Start as a beginner, practise step by step and grow into a pro coder with coding
            lessons, books, downloadable files and tutorial videos.
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-border/70 bg-card p-3 lg:sticky lg:top-24">
          <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Learn menu
          </p>
          <nav className="flex gap-2 overflow-x-auto lg:flex-col">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                aria-current={section === item.id ? "page" : undefined}
                className={`flex min-w-max flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left transition lg:w-full lg:flex-none ${section === item.id ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="hidden text-[11px] opacity-75 sm:block">{item.hint}</span>
                </span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          {section === "library" && (
            <div>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    Resource library
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold">Books & files</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Browse the available study material first. Upload is below the library.
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                  {files.length} resources
                </span>
              </div>
              {filesLoading ? (
                <Card className="p-8 text-sm text-muted-foreground">Loading books and files…</Card>
              ) : (
                <FileGrid files={files} />
              )}
              <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/60 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Share a learning resource</h3>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  Add a book, notes or a useful file for other learners.
                </p>
                <UploadDialog defaultCategory="book" />
              </div>
            </div>
          )}
          {section === "videos" && (
            <div>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    Watch and practise
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold">Learning videos</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tutorials and practical walkthroughs shared by the community.
                  </p>
                </div>
                <AddVideoDialog category="lesson" triggerLabel="Add learning video" />
              </div>
              {videosLoading ? (
                <Card className="p-8 text-sm text-muted-foreground">Loading videos…</Card>
              ) : (
                <VideoGrid videos={videos} />
              )}
            </div>
          )}
          {section === "lessons" && (
            <div>
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Start here
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold">Coding lessons</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  A simple path from the basics to building a real app.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {LESSONS.map((lesson) => (
                  <Card
                    key={lesson.title}
                    className="animate-rise gap-2 p-5 transition-transform duration-300 hover:-translate-y-1 hover:glow-panel"
                  >
                    <h3 className="font-display text-lg font-semibold">{lesson.title}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{lesson.body}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16" aria-labelledby="learning-guides-title">
        <div className="mb-7 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Original learning guides</p>
          <h2 id="learning-guides-title" className="mt-2 font-display text-2xl font-bold sm:text-3xl">
            A practical path from first line of code to a working web app
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            These beginner-friendly notes explain the ideas behind each stage, show small examples
            you can run yourself, and give you a task to practise. Work through them in order and
            change the examples rather than only copying them.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Written for the ExpertsTeam learning community · Updated November 10, 2026</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-5 sm:p-6">
            <h3 className="font-display text-xl font-semibold">Before you start: how to read code line by line</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Do not try to memorise a whole program at once. Read one statement, ask what value it creates,
              then follow where that value is used. In this example, the computer stores two numbers,
              multiplies them, saves the answer and prints it.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-[#07111f] p-4 text-xs leading-6 text-sky-100"><code>{'const price = 250;\nconst quantity = 4;\nconst total = price * quantity;\nconsole.log(total);'}</code></pre>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              <li><code>const price = 250</code> creates a named value called <code>price</code>.</li>
              <li><code>const quantity = 4</code> stores how many items we have.</li>
              <li><code>price * quantity</code> multiplies 250 by 4, and the result is stored in <code>total</code>.</li>
              <li><code>console.log(total)</code> prints <strong>1000</strong> in the developer console.</li>
            </ol>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              If the result is wrong, inspect the values before the calculation. Check spelling, brackets,
              data types and the first error in the console. This method works for JavaScript, Python and
              most other programming languages.
            </p>
            <p className="mt-3 text-sm font-medium">Practice: change the price to 125 and quantity to 6. Predict the answer before running the code, then check your prediction.</p>
          </article>
          <article className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <h3 className="font-display text-xl font-semibold">1. How a program runs</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              A program is a set of instructions a computer follows. Most beginner programs run
              statements in order, from top to bottom. The browser can run JavaScript directly, so
              you can experiment without installing a compiler. Save a file as <code>index.html</code>,
              open it in a browser and use the developer console to inspect errors.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-[#07111f] p-4 text-xs leading-6 text-sky-100"><code>{'console.log("Hello, ExpertsTeam!");\nconsole.log("This is my first program.");'}</code></pre>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              The first line prints a message; the second runs after it. If a program stops, read
              the first error carefully: the line number and message often point to the cause.
            </p>
            <p className="mt-3 text-sm font-medium">Practice: change the messages, add a third line, then create a deliberate spelling error and read the browser console.</p>
          </article>
          <article className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <h3 className="font-display text-xl font-semibold">2. Variables and data</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Variables give useful names to values. Use <code>const</code> when you do not plan
              to reassign a value and <code>let</code> when it must change. JavaScript commonly
              works with strings, numbers, booleans, arrays and objects. Choose names that describe
              what the value means.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-[#07111f] p-4 text-xs leading-6 text-sky-100"><code>{'const learner = "Chris";\nlet completedLessons = 1;\nconst isEnrolled = true;\ncompletedLessons += 1;\nconsole.log(learner, completedLessons, isEnrolled);'}</code></pre>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              An array stores an ordered list; an object groups related properties. Keep data in
              the type that matches how you will use it, and validate values received from forms.
            </p>
            <p className="mt-3 text-sm font-medium">Practice: store a product name, price and stock count, then calculate the total stock value.</p>
          </article>
          <article className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <h3 className="font-display text-xl font-semibold">3. Decisions, loops and logic</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Conditions let a program choose what to do. A loop repeats a task while a condition
              remains true or for each item in a collection. Use clear conditions and make sure a
              <code> while</code> loop eventually stops; otherwise it can freeze the page.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-[#07111f] p-4 text-xs leading-6 text-sky-100"><code>{'const scores = [62, 85, 47, 91];\nfor (const score of scores) {\n  if (score >= 50) {\n    console.log(score, "passed");\n  } else {\n    console.log(score, "try again");\n  }\n}'}</code></pre>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Test boundary values as well as normal ones. If the pass mark is 50, check what
              happens at 49, 50 and 51 so the rule behaves exactly as intended.
            </p>
            <p className="mt-3 text-sm font-medium">Practice: loop through five prices and print only the items costing less than 1,000.</p>
          </article>
          <article className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <h3 className="font-display text-xl font-semibold">4. Functions and reusable code</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              A function packages a task behind a name. It can accept inputs (parameters), perform
              work and return a result. Small functions are easier to test and reuse than one large
              block of code. Prefer returning a value when another part of the program needs it.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-[#07111f] p-4 text-xs leading-6 text-sky-100"><code>{'function calculateTotal(price, quantity) {\n  if (price < 0 || quantity < 0) {\n    throw new Error("Values cannot be negative");\n  }\n  return price * quantity;\n}\nconsole.log(calculateTotal(250, 4)); // 1000'}</code></pre>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Validate inputs at the boundary of your application. A function should have one
              clear responsibility and a name that explains its result.
            </p>
            <p className="mt-3 text-sm font-medium">Practice: write a function that converts a temperature from Celsius to Fahrenheit.</p>
          </article>
          <article className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <h3 className="font-display text-xl font-semibold">5. Build a small web page</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              HTML describes the page structure, CSS controls its appearance, and JavaScript adds
              behaviour. Start with semantic HTML elements such as <code>header</code>,
              <code> main</code> and <code>button</code>. Use labels for form controls and provide
              text alternatives for meaningful images.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-[#07111f] p-4 text-xs leading-6 text-sky-100"><code>{'<button id="greet">Say hello</button>\n<p id="message" aria-live="polite"></p>\n<script>\n  document.querySelector("#greet").addEventListener("click", () => {\n    document.querySelector("#message").textContent = "Welcome!";\n  });\n</script>'}</code></pre>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Build for small screens first, keep text readable and test the page using only a
              keyboard. Do not use a clickable-looking element unless it performs the action it
              promises.
            </p>
            <p className="mt-3 text-sm font-medium">Practice: add a labelled name input and show a personalised greeting when the button is pressed.</p>
          </article>
          <article className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
            <h3 className="font-display text-xl font-semibold">6. Databases and the web</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              A browser application often sends requests to a server, which reads or writes data in
              a database. A table stores records in rows and columns. Use stable IDs to identify
              records, validate input on the server and enforce access rules in the database—not
              only in the interface.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-[#07111f] p-4 text-xs leading-6 text-sky-100"><code>{'// Example request to a public API\nconst response = await fetch("/api/products");\nif (!response.ok) {\n  throw new Error("Could not load products");\n}\nconst products = await response.json();\nconsole.log(products);'}</code></pre>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Never put service-role keys, passwords or private API secrets in browser code.
              Authentication identifies a user; database row-level security decides which records
              that user is allowed to read or change.
            </p>
            <p className="mt-3 text-sm font-medium">Practice: sketch a products table with an ID, name, price and owner ID. Decide which records a signed-in user may edit.</p>
          </article>
        </div>
        <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <h3 className="font-semibold">How to get the most from these guides</h3>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            Run every example, change one thing at a time, and write down what changed. When an
            error appears, reproduce it, read the message and test a small fix. You can continue
            practising in the ExpertsTeam workspace, then share a finished project with the
            community when you are ready.
          </p>
        </div>
      </section>
    </PageShell>
  );
}
