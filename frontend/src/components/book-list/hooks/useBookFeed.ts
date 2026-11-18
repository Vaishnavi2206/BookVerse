// export function useBookFeed() {
//     const { uiUser } = useAuth();
//   const libraryState = useLibraryState(uiUser?.userId);
//   const libraryBooks = libraryState.books;
//   const ownedCollections = libraryState.collections;
//   const publicCollections = libraryState.publicCollections;
//   const [initialBooks] = useState(() => readCachedBooks(DEFAULT_QUERY));
//   const navigate = useNavigate();
//   const [listTab, setListTab] = useState<ListTab>("books");
//   const [bookView, setBookView] = useState<BookView>("all");
//   const [collectionTab, setCollectionTab] = useState<CollectionTab>("mine");
//   const [activeCollection, setActiveCollection] = useState<Collection | null>(
//     null,
//   );
//   const [selectedCollectionBook, setSelectedCollectionBook] =
//     useState<CollectionBook | null>(null);
//   const [books, setBooks] = useState<Book[]>(initialBooks ?? []);
//   const initialHasMore =
//     initialBooks === null || initialBooks.length % PAGE_SIZE === 0;
//   const [favouriteBooks] = useState<Book[]>(() => {
//     return getFavouriteBooks();
//   });
//   const [hasMore, setHasMore] = useState(initialHasMore);
//   const [isLoading, setIsLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [columns, setColumns] = useState(5);
//   const [gridHeight, setGridHeight] = useState(600);
//   const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
//   const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
//   const [headerElement, setHeaderElement] = useState<HTMLElement | null>(null);
//   const gridRef = useRef<GridImperativeAPI>(null);
//   const booksRef = useRef(books);
//   const favouritesRef = useRef(favouriteBooks); 
//   const requestRef = useRef<RequestCursor>({
//     query: DEFAULT_QUERY,
//     nextPage: initialBooks
//       ? Math.floor(initialBooks.length / PAGE_SIZE) + 1
//       : 1,
//     hasMore: initialHasMore,
//     loading: false,
//     requestId: 0,
//   });

//   const updateGridDimensions = useCallback(() => {
//     if (!listElement || !scrollElement) {
//       return;
//     }

//     const width = listElement.clientWidth;
//     setColumns(Math.max(1, Math.floor(width / 205)));
//     const availableHeight =
//       scrollElement.clientHeight -
//       (headerElement?.offsetHeight ?? 0) -
//       48;
//     setGridHeight(Math.max(2, availableHeight));
//   }, [headerElement, listElement, scrollElement]);
  
  
// }