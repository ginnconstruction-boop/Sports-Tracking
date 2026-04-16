import { LoginForm } from "@/components/auth/login-form";

type LoginPageProps = {
  searchParams?: Promise<{
    beta?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const betaBlocked = resolvedSearchParams?.beta === "not-approved";
  const errorMessage = resolvedSearchParams?.error ?? null;
  const infoMessage = resolvedSearchParams?.message ?? null;

  return (
    <main className="page-shell">
      <LoginForm betaBlocked={betaBlocked} errorMessage={errorMessage} infoMessage={infoMessage} />
    </main>
  );
}
