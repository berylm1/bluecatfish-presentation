import EditorBar from '@/components/editor/EditorBar';

// Password-protected page (see middleware.ts): shows who unlocked it and a Lock button
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EditorBar />
      {children}
    </>
  );
}
