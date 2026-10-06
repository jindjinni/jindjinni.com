// To Be Paid, the right-hand side: what this department does with an order. The waiting orders are the small cards
// on the left (see AccountsShell); opening one shows the complete Receiving form with Step 10 highlighted.
export default function ToBePaidPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">To Be Paid</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        These are the orders Receiving has finished and sent to Accounts. They fill in by themselves.
      </p>
      <ol className="mt-5 space-y-3 text-sm text-slate-700 dark:text-slate-200">
        <li className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <strong>1. Open an order.</strong> Pick a card on the left. You see the complete receiving form, exactly as Receiving filled it in, for your review.
        </li>
        <li className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <strong>2. Go to Step 10.</strong> It is highlighted at the bottom of the form: that is where Accounts works. Pay the order by ACH on your payables system.
        </li>
        <li className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <strong>3. Attach the receipt and mark it Paid.</strong> The date and time are stamped for you, and the order moves to Paid Orders.
        </li>
      </ol>
    </div>
  );
}
