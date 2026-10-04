export default function IntakeIndexPage() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p aria-hidden="true" className="text-5xl">📝</p>
      <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-50">Receiving Intake Form</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Pick a shipment from the list to see or fill in its intake form. To receive a new package, search for its order by reference #, customer or tracking # in the box at the top of the list and press Start.
      </p>
    </div>
  );
}
