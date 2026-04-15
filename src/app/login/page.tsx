import { LoginForm } from "@/components/auth/login-form";

type LoginPageProps = {
  searchParams?: Promise<{
    beta?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const betaBlocked = resolvedSearchParams?.beta === "not-approved";

  return (
    <main className="page-shell">
      <LoginForm betaBlocked={betaBlocked} />
    </main>
  );
}
