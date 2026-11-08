import WorkspaceApp from "../../workspace-app";

export default async function InspectionReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspaceApp initialPage="Review" initialSelected={id} />;
}
