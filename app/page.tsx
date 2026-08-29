import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center px-4">
      <main className="flex flex-col items-center gap-8 max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          Sidecar
        </h1>
        
        <p className="text-xl text-zinc-400 max-w-lg">
          Watch YouTube on your desktop (muted), hear the audio on your phone. 
          Perfect sync, no downloads.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Link
            href="/desktop"
            className="px-8 py-4 bg-white text-zinc-950 rounded-lg font-medium hover:bg-zinc-200 transition-colors"
          >
            Host on Desktop
          </Link>
          
          <Link
            href="/phone"
            className="px-8 py-4 bg-zinc-800 text-white rounded-lg font-medium hover:bg-zinc-700 transition-colors border border-zinc-700"
          >
            Join on Phone
          </Link>
        </div>

        <div className="mt-12 p-6 bg-zinc-900 rounded-lg text-left max-w-md">
          <h2 className="font-semibold mb-3">How it works</h2>
          <ol className="text-sm text-zinc-400 space-y-2">
            <li>1. Open this site on your desktop and paste a YouTube URL</li>
            <li>2. Scan the QR code with your phone or enter the room code</li>
            <li>3. Tap to start audio on your phone</li>
            <li>4. Watch and listen in perfect sync</li>
          </ol>
        </div>

        <p className="text-xs text-zinc-600 mt-8">
          Uses the official YouTube IFrame API. Keep your phone screen on for best results.
        </p>
      </main>
    </div>
  );
}
