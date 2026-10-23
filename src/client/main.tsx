import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { User } from "../shared/types/index.ts";
import { Header } from "./components/Header.tsx";
import { api } from "./lib/api.ts";
import { navigate, usePath } from "./lib/router.ts";
import { connect, disconnect } from "./lib/socket.ts";
import { BoardPage } from "./pages/BoardPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";

function App() {
  const path = usePath();
  const [user, setUser] = useState<User | null>();

  useEffect(() => {
    api<User>("/users/me").then(setUser, () => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    connect();
    return disconnect;
  }, [user]);

  if (user === undefined) return null;
  if (!user) return <LoginPage onLogin={setUser} />;

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    navigate("/");
  };
  const boardId = path.match(/^\/boards\/([^/]+)/)?.[1];

  return (
    <>
      <Header user={user} onLogout={logout} />
      {boardId ? <BoardPage key={boardId} id={boardId} user={user} /> : <HomePage />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
