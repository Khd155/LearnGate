import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "خلدية | تشخيص فجوات التعلم وخطط مخصصة" },
      { name: "description", content: "اكتشف فجوات تعلمك في المهارات اللفظية والكمية مع منصة خلدية. قيّم نفسك واحصل على خطة دعم تعليمي مخصصة بناءً على نتائجك." },
      { property: "og:title", content: "خلدية | تشخيص فجوات التعلم وخطط مخصصة" },
      { property: "og:description", content: "اكتشف فجوات تعلمك في المهارات اللفظية والكمية مع منصة خلدية. قيّم نفسك واحصل على خطة دعم تعليمي مخصصة بناءً على نتائجك." },
      { property: "og:image", content: "https://test.khormi.site/khaldiya-og.jpg" },
      { property: "og:url", content: "https://test.khormi.site" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "خلدية" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://test.khormi.site/khaldiya-og.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://test.khormi.site" }],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/khaldiya/index.html"
      title="Khaldiya"
      style={{ border: 0, width: "100vw", height: "100vh", display: "block" }}
    />
  );
}
