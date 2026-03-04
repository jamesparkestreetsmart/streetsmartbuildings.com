import SiteOrgSync from "./site-org-sync";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ siteid: string }>;
}) {
  const { siteid } = await params;

  return (
    <>
      <SiteOrgSync siteId={siteid} />
      {children}
    </>
  );
}
