import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <div className="eyebrow">404</div>
      <h1 className="display mt-3 text-3xl">Nothing here</h1>
      <Link href="/" className="btn mt-8">
        Back to command
      </Link>
    </div>
  );
}
