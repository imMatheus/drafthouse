import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-neutral-900">
      <h1 className="text-4xl font-bold text-white">Drafthouse</h1>
      <div className="flex gap-4">
        <Link to="/about" className="rounded-lg bg-white/10 px-4 py-2 text-white hover:bg-white/20">
          About
        </Link>
        <Link to="/posts" className="rounded-lg bg-white/10 px-4 py-2 text-white hover:bg-white/20">
          Posts
        </Link>
      </div>
    </div>
  )
}
