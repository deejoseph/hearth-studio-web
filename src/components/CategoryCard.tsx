import { Link } from "react-router-dom";
import type { FC } from "react";

type CategoryCardProps = {
  title: string;
  description: string;
  image: string;
  href: string;
};

const CategoryCard: FC<CategoryCardProps> = ({
  title,
  description,
  image,
  href,
}) => {
  console.log(title, image);
  return (
    <Link to={href} className="group block relative overflow-hidden">
      <div
        className="h-[420px] bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
        style={{ backgroundImage: `url(${image})` }}
      />
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition" />
      <div className="absolute bottom-10 left-10 text-white max-w-xs">
        <h3 className="text-2xl font-light tracking-wide">{title}</h3>
        <p className="mt-3 text-sm opacity-90">{description}</p>
      </div>
    </Link>
  );
};

export default CategoryCard;