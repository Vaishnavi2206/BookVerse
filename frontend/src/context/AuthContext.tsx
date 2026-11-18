import {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";
import type { ReactNode } from "react";

import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { auth } from "../shared/firebase";

export interface AuthUser {
  displayName: string | null;
  photoUrl: string | null;
  email: string | null;
  userId: string;
}

interface AuthContextType {
  user: User | null;
  uiUser: AuthUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({
  children
}: {
  children: ReactNode;
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [uiUser, setUiUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setUiUser(
        currentUser
          ? {
              displayName: currentUser.displayName,
              photoUrl: currentUser.photoURL,
              email: currentUser.email,
              userId: currentUser.uid,
            }
          : null
      );
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, uiUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};