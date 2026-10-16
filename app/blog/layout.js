import "./blog.css";

// Nothing but the blog's stylesheet. Every rule in it is prefixed `bl-` so it
// cannot touch the order page, the private page or the admin.
export default function BlogLayout({ children }) {
  return children;
}
