import React, { useEffect } from "react";
import "./Search.css";
const Search = ({
  handleSearch,
}: {
  handleSearch: (query: string) => boolean;
}) => {
  const [query, setQuery] = React.useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      if (handleSearch(query)) {
        setQuery("");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, handleSearch]);

  return (
    <input
      type="text"
      value={query}
      placeholder="Search for books..."
      className="input-primary"
      onChange={(e) => setQuery(e.target.value)}
    />
  );
};

export default Search;
