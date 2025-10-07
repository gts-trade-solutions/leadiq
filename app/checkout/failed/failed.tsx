export default function FailedPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <h1 className="text-3xl font-bold text-red-400">Payment Cancelled or Failed</h1>
        <p className="text-gray-300 mt-2">No money was taken. You can try again from Pricing.</p>
      </div>
    </div>
  );
}
