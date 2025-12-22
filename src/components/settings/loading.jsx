export default function Loading() {
  return (
    <div className="relative box-border w-100 overflow-hidden h-42 rounded-md shadow-[1px_4px_5px_3px_#9647eb] bg-zinc-900 px-4 py-6 font-mono text-base text-green-500 border border-zinc-700">
      <div className="absolute left-0 right-0 top-0 box-border h-10 rounded-t bg-zinc-800 px-2 py-2">
        <div className="float-left text-2xl leading-6 text-zinc-200">
          Status
        </div>

        <div className="float-right">
          <span className="ml-2 inline-block h-5 w-5 rounded-full bg-red-500" />
          <span className="ml-2 inline-block h-5 w-5 rounded-full bg-yellow-400" />
          <span className="ml-2 inline-block h-5 w-5 rounded-full bg-green-500" />
        </div>
      </div>

      {/* Typing text */}
      <div className="mt-10 inline-block text-[26px] whitespace-nowrap overflow-hidden border-r-[0.2em] border-r-green-500 animate-terminal-typing">
        Loading...
      </div>
    </div>
  );
}
