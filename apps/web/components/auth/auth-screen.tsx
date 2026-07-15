import { Suspense } from "react";
import { LoginCard } from "./login-card";
import { RegisterCard } from "./register-card";

/** Two-card Auth screen from the design proposal: log in + create account. */
export function AuthScreen() {
  return (
    <div className="mx-auto mb-16 mt-12 grid w-full max-w-[920px] grid-cols-1 items-start gap-7 px-8 md:grid-cols-2">
      <Suspense>
        <LoginCard />
      </Suspense>
      <RegisterCard />
    </div>
  );
}
