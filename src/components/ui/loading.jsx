export default function Loading() {
  return (
    <div className="relative box-border w-48 overflow-hidden rounded bg-zinc-900 px-4 py-6 font-mono text-base text-green-500 shadow-md border border-zinc-700">
      {/* Header */}
      <div className="absolute left-0 right-0 top-0 box-border h-6 rounded-t bg-zinc-800 px-2">
        <div className="float-left leading-6 text-zinc-200">Status</div>

        <div className="float-right">
          <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
        </div>
      </div>

      {/* Typing text */}
      <div className="mt-6 inline-block whitespace-nowrap overflow-hidden border-r-[0.2em] border-r-green-500 animate-terminal-typing">
        Loading...
      </div>
    </div>
  );
}
