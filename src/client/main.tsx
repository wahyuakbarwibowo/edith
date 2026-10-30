import type { User as AuthUser } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "../shared/types/index.ts";
import { Header } from "./components/Header.tsx";
import { usePath } from "./lib/router.ts";
import { supabase } from "./lib/supabase.ts";
import { BoardPage } from "./pages/BoardPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";

const toUser = (u: AuthUser): User => ({ id: u.id, email: u.email ?? "", name: u.user_metadata.name ?? u.email ?? "" });

function App() {
  const path = usePath();
  const [user, setUser] = useState<User | null>();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Keep the same object while the user is unchanged so token refreshes don't rerender everything.
      setUser((prev) => (session ? (prev?.id === session.user.id ? prev : toUser(session.user)) : null));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (user === undefined) return null;
  if (!user) return <LoginPage />;

  const boardId = path.match(/^\/boards\/([^/]+)/)?.[1];
  return (
    <>
      <Header user={user} onLogout={() => supabase.auth.signOut()} />
      {boardId ? <BoardPage key={boardId} id={boardId} user={user} /> : <HomePage user={user} />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
