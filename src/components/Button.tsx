import { Link } from "react-router-dom";
import type { ReactNode } from "react";

type ButtonProps = {
  href: string;
  children: ReactNode;
};

const Button = ({ href, children }: ButtonProps) => {
  return (
    <Link
      to={href}
      className="inline-block mt-6 text-sm tracking-wide uppercase border-b border-black pb-1 hover:opacity-60 transition"
    >
      {children}
    </Link>
  );
};

export default Button;