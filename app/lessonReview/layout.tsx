import EditorBar from '@/components/editor/EditorBar';

// Password-protected page (see proxy.ts): shows who unlocked it and a Lock button (not when printed)
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="print:hidden"><EditorBar /></div>
      {children}
    </>
  );
}
