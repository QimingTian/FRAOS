export function AccountPageHeader({ username }: { username: string }) {
  return (
    <header>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-fg md:text-4xl">
        {username}
      </h1>
    </header>
  )
}
