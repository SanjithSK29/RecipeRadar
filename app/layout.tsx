import "./globals.css";
export const metadata = {
  title: "RecipeRadar — Good food. Made for you.",
  description:
    "Discover recipes, understand ingredients, and plan a week that feels good.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
