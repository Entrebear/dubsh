import { LoadingSpinner, useMediaQuery } from "@dub/ui";
import { fetcher } from "@dub/utils";
import { Dispatch, SetStateAction, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { useDebounce } from "use-debounce";

type StockItem = {
  id: string;
  description: string;
  urls: { regular: string; small: string; thumb: string };
  user: { name: string; links: { html: string } };
};

export default function StockSearch({
  onImageSelected,
  setOpenPopover,
}: {
  onImageSelected: (image: string) => void;
  setOpenPopover: Dispatch<SetStateAction<boolean>>;
}) {
  const [search, setSearch] = useState("");
  const [debouncedQuery] = useDebounce(search, 350);

  const { data } = useSWR<{ results: StockItem[] }>(
    `/api/stock/search?query=${encodeURIComponent(debouncedQuery)}`,
    fetcher,
    {
      onError: (err) => toast.error(err.message),
    },
  );

  const { isMobile } = useMediaQuery();

  return (
    <div
      className="h-[24rem] w-full overflow-auto p-3 md:w-[24rem]"
      // Fixes a Webkit issue where elements outside of the visible area are still interactable
      style={{ WebkitClipPath: "inset(0 0 0 0)" }}
    >
      <div className="relative mt-1 rounded-md shadow-sm">
        <input
          type="text"
          name="search"
          id="search"
          placeholder="Search local images..."
          autoFocus={!isMobile}
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="block w-full rounded-md border-neutral-300 py-1 text-neutral-900 placeholder-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-neutral-500 sm:text-sm"
        />
      </div>

      {data ? (
        data.results.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {data.results.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => {
                  onImageSelected(photo.urls.regular);
                  setOpenPopover(false);
                }}
                className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-md bg-neutral-100 transition-all hover:brightness-75"
              >
                <img
                  src={photo.urls.small}
                  alt={photo.description || "Stock image"}
                  className="absolute h-full w-full object-cover"
                />
                <p className="absolute bottom-0 left-0 right-0 line-clamp-1 w-full bg-black bg-opacity-10 p-1 text-xs text-white">
                  {photo.user.name}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-[90%] items-center justify-center">
            <p className="text-center text-sm text-neutral-500">
              No results found.
            </p>
          </div>
        )
      ) : (
        <div className="flex h-[90%] items-center justify-center">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
}
