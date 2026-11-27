// Password-protected page (see proxy.ts). The editor has its own top bar (who unlocked it and Lock are in its menu),
// so the shared EditorBar isn't shown here: one bar, not two.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
