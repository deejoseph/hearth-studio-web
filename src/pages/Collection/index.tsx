import Section from "@/components/Section";
import CategoryCard from "@/components/CategoryCard";
import FeaturedSplit from "@/components/FeaturedSplit";
import Button from "@/components/Button";
import celebrationImg from "@/assets/images/collection/Celebration.png";
import coffeeImg from "@/assets/images/collection/Coffeecup.png";
import teaImg from "@/assets/images/collection/Teaset.png";
import decorImg from "@/assets/images/collection/Lampbase.png";
import craftImg from "@/assets/images/collection/Craftsmanship.png";
import personalImg from "@/assets/images/collection/Personalization.png";
import weddingImg from "@/assets/images/collection/wedding.png";
import translucencyImg from "@/assets/images/collection/Translucency.png";

export default function CollectionsPage() {
  return (
    <main className="text-[#1a1a1a] font-light">

      {/* HERO */}
      <Section background="soft" className="text-center">
        <h1 className="text-6xl tracking-wide mb-6">
          Collections
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Celadon crafted for the rituals of everyday life.
        </p>
      </Section>

      {/* CATEGORY GRID */}
      <Section>
        <div className="grid md:grid-cols-2 gap-12">
          <CategoryCard
            title="Tableware"
            description="Hand-carved celadon for gatherings and shared meals."
            image={celebrationImg}
            href="/collections/tableware"
          />
          <CategoryCard
            title="Coffee Ware"
            description="Refined forms for slow mornings."
            image={coffeeImg}
            href="/collections/coffee"
          />
          <CategoryCard
            title="Tea Ware"
            description="Porcelain shaped for stillness."
            image={teaImg}
            href="/collections/tea"
          />
          <CategoryCard
            title="Home Décor"
            description="Objects that anchor a space."
            image={decorImg}
            href="/collections/decor"
          />
        </div>
      </Section>

      {/* FEATURED STORY */}
<Section background="warm">
  <div className="text-center mb-24">
    <h2 className="text-4xl tracking-wide mb-4">
      Featured Collection
    </h2>
    <p className="text-gray-600">Tableware</p>
  </div>

  <FeaturedSplit
    title="A Gift Meant to Be Kept for Generations"
    text="Hand-carved celadon tableware, crafted as a timeless wedding heirloom."
    image={weddingImg}
  />

  <div className="mt-40">
    <FeaturedSplit
      title="Carved by Hand, One Line at a Time"
      text="Each plate begins as raw clay, shaped and carved before glazing."
      image={personalImg}
      reverse
    />
  </div>

  {/* 🔥 新增：工艺细节展示 */}
  <div className="mt-40">
    <FeaturedSplit
      title="The Art of Hand-Carved Relief"
      text="Every motif is carved with patience and precision, revealing delicate depth beneath the glaze. Each line is guided by hand, preserving the warmth of craftsmanship."
      image={craftImg}
    />
  </div>

  <div className="mt-40">
    <FeaturedSplit
      title="Where Light Meets Porcelain"
      text="Linglong carving reveals translucency in natural light."
      image={translucencyImg}
      reverse
    />
  </div>

  <div className="text-center mt-32">
    <Button href="/collections/tableware">
      Explore Tableware Collection →
    </Button>
  </div>
</Section>

    </main>
  );
}