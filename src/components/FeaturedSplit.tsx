import React from "react";

interface Props {
  title: string;
  text: string;
  image: string;
  reverse?: boolean;
}

const FeaturedSplit: React.FC<Props> = ({
  title,
  text,
  image,
  reverse = false,
}) => {
  return (
    <div className="grid md:grid-cols-2 gap-16 items-center">
      {!reverse && (
        <div
          className="h-[520px] bg-cover bg-center"
          style={{ backgroundImage: `url(${image})` }}
        />
      )}

      <div>
        <h2 className="text-3xl md:text-4xl font-light tracking-wide">
          {title}
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-gray-700">
          {text}
        </p>
      </div>

      {reverse && (
        <div
          className="h-[520px] bg-cover bg-center"
          style={{ backgroundImage: `url(${image})` }}
        />
      )}
    </div>
  );
};

export default FeaturedSplit;