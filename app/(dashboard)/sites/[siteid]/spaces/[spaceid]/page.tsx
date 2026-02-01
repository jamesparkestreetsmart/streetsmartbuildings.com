import SpaceDetailClient from "./SpaceDetailClient";

export default async function SpaceDetailPage({
  params,
}: {
  params: Promise<{ siteid: string; spaceid: string }>;
}) {
  const { siteid, spaceid } = await params;

  return <SpaceDetailClient siteid={siteid} spaceid={spaceid} />;
}
