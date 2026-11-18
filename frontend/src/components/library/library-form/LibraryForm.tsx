import { useEffect, useState, type FormEventHandler } from "react";
import {
  useForm,
  useWatch,
  type FieldErrors,
  type FieldPath,
  type UseFormClearErrors,
  type UseFormRegister,
} from "react-hook-form";
import "./LibraryForm.css";
import type {
  BookWork,
  LibraryBook,
  LibraryFormProps,
  TabId,
} from "../../../types/form-types";
import { toast } from "react-toastify";
import { addBookToLibrary, type UserCollection } from "../../../shared/api";
import { useAuth } from "../../../context/AuthContext";
import { getCachedLibraryBook } from "../../../shared/library-cache-db";
import {
  saveLibraryBookToState,
  useLibraryState,
} from "../../../shared/library-state";

const tabs: { id: TabId; label: string }[] = [
  { id: "book-details", label: "Details" },
  { id: "library-and-reading-preferences", label: "Reading Preferences" },
  { id: "reading-progress-and-goals", label: "Reading Progress" },
  { id: "review-and-confirmation", label: "Review & Confirmation" },
];

const readingStatuses = [
  "Want to Read",
  "Reading",
  "Completed",
  "Paused",
  "Did Not Finish",
] as const;

type LibraryFormValues = {
  libraryStatus: (typeof readingStatuses)[number];
  readingFormat: "Physical" | "Ebook" | "Audiobook";
  favourite: boolean;
  createCollection: boolean;
  collectionName: string;
  collectionIsPublic: boolean;
  collectionIds: string[];
  personalRating: number;
  dateAdded: string;
  startDate: string;
  currentPage: number;
  targetCompletionDate: string;
  readingGoalEnabled: boolean;
  dailyPageGoal: number;
  reviewTitle: string;
  reviewText: string;
  favouriteQuote: string;
  privateNote: string;
  bookFields: BookFieldValues;
  key?: string;
};

const fieldsByTab: Partial<Record<TabId, FieldPath<LibraryFormValues>[]>> = {
  "library-and-reading-preferences": [
    "libraryStatus",
    "readingFormat",
    "collectionName",
    "collectionIds",
    "personalRating",
    "dateAdded",
  ],
  "reading-progress-and-goals": [
    "startDate",
    "currentPage",
    "targetCompletionDate",
    "readingGoalEnabled",
    "dailyPageGoal",
  ],
  "review-and-confirmation": ["reviewTitle", "reviewText", "favouriteQuote", "privateNote"],
};

type BookFieldValues = {
  title: string;
  author: string;
  firstPublished: string;
  description: string;
  subjects: string;
};

type BookField = {
  label: string;
  value: string;
};
type SectionProps = {
  register: UseFormRegister<LibraryFormValues>;
  errors: FieldErrors<LibraryFormValues>;
};

function getLocalDateString() {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function BookDetailsSection({
  bookFields,
}: {
  bookFields: BookField[];
}) {
  return (
    <div className="library-form-fields">
      {bookFields.map((field) => (
        <label className="library-form-field-group" key={field.label}>
          <span>{field.label}</span>
          <input className="library-form-field" type="text" value={field.value} readOnly />
        </label>
      ))}
    </div>
  );
}

function LibraryPreferencesSection({
  register,
  errors,
  isCollectionEnabled,
  collections,
  collectionsLoading,
  collectionsError,
}: SectionProps & {
  isCollectionEnabled: boolean;
  collections: UserCollection[];
  collectionsLoading: boolean;
  collectionsError: boolean;
}) {
  return (
    <div className="library-form-fields">
      <label className="library-form-field-group" htmlFor="library-status">
        <span>Library status</span>
        <select
          id="library-status"
          className="library-form-field"
          {...register("libraryStatus", { required: "Choose a library status." })}
          aria-invalid={Boolean(errors.libraryStatus)}
        >
          <option value="">Select a status</option>
          {readingStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        {errors.libraryStatus && (
          <span className="library-form-error">{errors.libraryStatus.message}</span>
        )}
      </label>

      <label className="library-form-field-group" htmlFor="reading-format">
        <span>Reading format</span>
        <select
          id="reading-format"
          className="library-form-field"
          {...register("readingFormat", { required: "Choose a reading format." })}
          aria-invalid={Boolean(errors.readingFormat)}
        >
          <option value="">Select a format</option>
          <option value="Physical">Physical</option>
          <option value="Ebook">Ebook</option>
          <option value="Audiobook">Audiobook</option>
        </select>
        {errors.readingFormat && (
          <span className="library-form-error">{errors.readingFormat.message}</span>
        )}
      </label>

      <div className="library-collection-card">
        <fieldset className="library-collection-existing">
          <legend>Add to existing collections</legend>
          {collectionsLoading ? (
            <p role="status">Loading your collections...</p>
          ) : collections.length > 0 ? (
            collections.map((collection) => (
              <label className="library-form-checkbox" key={collection.id}>
                <input
                  type="checkbox"
                  value={collection.id}
                  {...register("collectionIds")}
                />
                <span>
                  <strong>{collection.name}</strong>
                  <small>{collection.isPublic ? "Public" : "Private"}</small>
                </span>
              </label>
            ))
          ) : (
            <p>
              {collectionsError
                ? "Your collections could not be loaded. Existing memberships will be kept."
                : "You do not have any collections yet."}
            </p>
          )}
        </fieldset>

        <label className="library-form-checkbox" htmlFor="create-collection">
          <input
            id="create-collection"
            type="checkbox"
            {...register("createCollection")}
          />
          <span>
            <strong>Create a collection</strong>
            <small>Organize this book under a custom board.</small>
          </span>
        </label>

        {isCollectionEnabled && (
          <div className="library-collection-options">
            <label className="library-form-field-group" htmlFor="collection-name">
              <span>Collection name</span>
              <input
                id="collection-name"
                className="library-form-field"
                type="text"
                minLength={5}
                maxLength={20}
                placeholder="e.g. Modern romance"
                {...register("collectionName", {
                  validate: (value) =>
                    !isCollectionEnabled ||
                    (value.trim().length >= 5 && value.trim().length <= 20) ||
                    "Enter a collection name between 5 and 20 characters.",
                })}
                aria-invalid={Boolean(errors.collectionName)}
                aria-describedby={
                  errors.collectionName ? "collection-name-error" : "collection-name-hint"
                }
              />
              {errors.collectionName ? (
                <span id="collection-name-error" className="library-form-error" role="alert">
                  {errors.collectionName.message}
                </span>
              ) : (
                <span id="collection-name-hint" className="library-collection-hint">
                  5–20 characters
                </span>
              )}
            </label>

            <label className="library-form-checkbox" htmlFor="collection-public">
              <input
                id="collection-public"
                type="checkbox"
                {...register("collectionIsPublic")}
              />
              <span>
                <strong>Make this collection public</strong>
                <small>Private by default.</small>
              </span>
            </label>
          </div>
        )}
      </div>

      <label className="library-form-field-group" htmlFor="personal-rating">
        <span>Personal rating</span>
        <select
          id="personal-rating"
          className="library-form-field"
          {...register("personalRating", {
            required: "Choose a rating.",
            valueAsNumber: true,
          })}
          aria-invalid={Boolean(errors.personalRating)}
        >
          <option value="">Select a rating</option>
          {[1, 2, 3, 4, 5].map((rating) => (
            <option key={rating} value={rating}>
              {rating} / 5
            </option>
          ))}
        </select>
        {errors.personalRating && (
          <span className="library-form-error">{errors.personalRating.message}</span>
        )}
      </label>

      <label className="library-form-field-group" htmlFor="date-added">
        <span>Date added</span>
        <input
          id="date-added"
          className="library-form-field"
          type="date"
          {...register("dateAdded", { required: "Choose a date." })}
          aria-invalid={Boolean(errors.dateAdded)}
        />
        {errors.dateAdded && (
          <span className="library-form-error">{errors.dateAdded.message}</span>
        )}
      </label>

      <label className="library-form-checkbox" htmlFor="favourite">
        <input id="favourite" type="checkbox" {...register("favourite")} />
        <span>Add to favourites</span>
      </label>
    </div>
  );
}

function ReadingProgressSection({
  register,
  errors,
  clearErrors,
  isReadingGoalEnabled,
}: Pick<SectionProps, "register" | "errors"> & {
  clearErrors: UseFormClearErrors<LibraryFormValues>;
  isReadingGoalEnabled: () => boolean;
}) {
  const today = getLocalDateString();

  return (
    <div className="library-progress-section">
      <div className="library-section-heading">
        <span className="library-section-icon" aria-hidden="true">
          01
        </span>
        <div>
          <h3>Track your reading</h3>
          <p>Set a starting point and a goal that works for you.</p>
        </div>
      </div>

      <div className="library-progress-card">
        <div className="library-progress-grid">
          <label className="library-form-field-group" htmlFor="start-date">
            <span>Start date</span>
            <input
              id="start-date"
              className="library-form-field"
              type="date"
              {...register("startDate", {
                min: { value: today, message: "Start date cannot be in the past." },
              })}
              aria-invalid={Boolean(errors.startDate)}
              aria-describedby={errors.startDate ? "start-date-error" : undefined}
            />
            {errors.startDate && (
              <span id="start-date-error" className="library-form-error" role="alert">
                {errors.startDate.message}
              </span>
            )}
          </label>
          <label className="library-form-field-group" htmlFor="current-page">
            <span>Current page</span>
            <input
              id="current-page"
              className="library-form-field"
              type="number"
              min="1"
              step="1"
              placeholder="e.g. 42"
              {...register("currentPage", {
                min: { value: 1, message: "Current page must be at least 1." },
                valueAsNumber: true,
                required: "Enter the current page.",
                validate: (value) =>
                  Number.isInteger(value) || "Enter a whole page number.",
              })}
              aria-invalid={Boolean(errors.currentPage)}
              aria-describedby={errors.currentPage ? "current-page-error" : undefined}
            />
            {errors.currentPage && (
              <span id="current-page-error" className="library-form-error" role="alert">
                {errors.currentPage.message}
              </span>
            )}
          </label>
          <label className="library-form-field-group" htmlFor="target-completion-date">
            <span>Target completion date</span>
            <input
              id="target-completion-date"
              className="library-form-field"
              type="date"
              {...register("targetCompletionDate")}
            />
          </label>
        </div>
      </div>

      <div className="library-goal-card">
        <label className="library-goal-toggle" htmlFor="reading-goal-enabled">
          <span className="library-goal-toggle-copy">
            <strong>Set a daily reading goal</strong>
            <small>Choose how many pages you would like to read each day.</small>
          </span>
          <input
            id="reading-goal-enabled"
            type="checkbox"
            {...register("readingGoalEnabled", {
              onChange: (event) => {
                if (!event.target.checked) clearErrors("dailyPageGoal");
              },
            })}
          />
        </label>
        <label className="library-form-field-group library-daily-goal" htmlFor="daily-page-goal">
          <span>Pages per day</span>
          <input
            id="daily-page-goal"
            className="library-form-field"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 20"
            {...register("dailyPageGoal", {
              min: { value: 1, message: "Pages per day must be at least 1." },
              valueAsNumber: true,
              validate: (value) =>
                !isReadingGoalEnabled() ||
                  (Number.isInteger(value) && value >= 1) ||
                "Enter a daily page goal.",
            })}
            aria-invalid={Boolean(errors.dailyPageGoal)}
            aria-describedby={errors.dailyPageGoal ? "daily-page-goal-error" : undefined}
          />
          {errors.dailyPageGoal && (
            <span id="daily-page-goal-error" className="library-form-error" role="alert">
              {errors.dailyPageGoal.message}
            </span>
          )}
        </label>
      </div>
    </div>
  );
}

function ReviewSection({ register, errors }: SectionProps) {
  return (
    <div className="library-form-review">
      <div className="library-section-heading">
        <span className="library-section-icon" aria-hidden="true">
          04
        </span>
        <div>
          <h3>Your review</h3>
          <p>Add a few thoughts to remember what you think of this book.</p>
        </div>
      </div>

      <div className="library-review-card">
        <label className="library-form-field-group" htmlFor="review-title">
          <span>Review title</span>
          <input
            id="review-title"
            className="library-form-field"
            type="text"
            placeholder="Give your review a title"
            {...register("reviewTitle", { required: "Enter the review title." })}
            aria-invalid={Boolean(errors.reviewTitle)}
          />
          {errors.reviewTitle && (
            <span className="library-form-error">{errors.reviewTitle.message}</span>
          )}
        </label>

        <label className="library-form-field-group" htmlFor="review-text">
          <span>Review</span>
          <textarea
            id="review-text"
            className="library-form-field library-review-textarea"
            placeholder="What stood out to you?"
            {...register("reviewText", {
              required: "Enter your review.",
              maxLength: {
                value: 500,
                message: "Review text cannot exceed 500 characters.",
              },
            })}
            aria-invalid={Boolean(errors.reviewText)}
          />
          {errors.reviewText && (
            <span className="library-form-error">{errors.reviewText.message}</span>
          )}
        </label>

        <label className="library-form-field-group" htmlFor="favourite-quote">
          <span>
            Favourite quote <small>(optional)</small>
          </span>
          <input
            id="favourite-quote"
            className="library-form-field"
            type="text"
            placeholder="A line you want to remember"
            {...register("favouriteQuote", {
              maxLength: {
                value: 50,
                message: "Favourite quote cannot exceed 50 characters.",
              },
            })}
            aria-invalid={Boolean(errors.favouriteQuote)}
          />
          {errors.favouriteQuote && (
            <span className="library-form-error">{errors.favouriteQuote.message}</span>
          )}
        </label>

        <label className="library-form-field-group" htmlFor="private-note">
          <span>
            Private note <small>(optional)</small>
          </span>
          <textarea
            id="private-note"
            className="library-form-field library-review-textarea library-private-note"
            placeholder="Personal notes, visible only to you"
            {...register("privateNote", {
              maxLength: {
                value: 200,
                message: "Private note cannot exceed 200 characters.",
              },
            })}
            aria-invalid={Boolean(errors.privateNote)}
          />
          {errors.privateNote && (
            <span className="library-form-error">{errors.privateNote.message}</span>
          )}
        </label>
      </div>

      <p className="library-review-confirmation">
        Your book and review will be saved to your library when you choose <strong>Add to library</strong>.
      </p>
    </div>
  );
}

function LibraryFormActions({
  activeIndex,
  isLastStep,
  isSubmitting,
  isStateLoading,
  onBack,
}: {
  activeIndex: number;
  isLastStep: boolean;
  isSubmitting: boolean;
  isStateLoading: boolean;
  onBack: () => void;
}) {
  return (
    <div className="library-form-actions">
      <button
        className="library-form-button library-form-button-secondary"
        type="button"
        disabled={activeIndex === 0}
        onClick={onBack}
      >
        Back
      </button>
      <button
        className="library-form-button library-form-button-primary"
        type="submit"
        disabled={isLastStep && (isSubmitting || isStateLoading)}
      >
        {isLastStep
          ? isStateLoading
            ? "Loading library..."
            : isSubmitting
              ? "Saving..."
              : "Add to library"
          : "Next"}
      </button>
    </div>
  );
}

const formDefaults: Partial<LibraryFormValues> = {
  favourite: false,
  createCollection: false,
  collectionName: "",
  collectionIsPublic: false,
  collectionIds: [],
  dateAdded: getLocalDateString(),
};

function LibraryForm({ book, onClose }: LibraryFormProps) {
  const { uiUser } = useAuth();
  const libraryState = useLibraryState(uiUser?.userId);
  const [bookDetails, setBookDetails] = useState<BookWork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("book-details");
  const [savedBook, setSavedBook] = useState<LibraryBook | null>(null);
  const collections = libraryState.collections;
  const collectionsLoading = libraryState.loading;
  const collectionsError = Boolean(libraryState.error);

  const {
    control,
    register,
    handleSubmit,
    trigger,
    reset,
    getValues,
    clearErrors,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LibraryFormValues>({
    defaultValues: formDefaults,
  });
  const isCollectionEnabled = Boolean(
    useWatch({ control, name: "createCollection" }),
  );

  useEffect(() => {
    reset(formDefaults);
  }, [book.key, reset]);

  useEffect(() => {
    if (libraryState.loading) return;
    const controller = new AbortController();

    async function fetchBookDetails() {
      setLoading(true);
      setError(null);
      setBookDetails(null);
      setSavedBook(null);

      try {
        const cachedBook = uiUser?.userId
          ? await getCachedLibraryBook(uiUser.userId, book.key)
          : null;
        if (cachedBook) {
          setSavedBook(cachedBook);
          reset({
            ...formDefaults,
            libraryStatus: cachedBook.libraryStatus,
            readingFormat: cachedBook.readingFormat,
            favourite: cachedBook.favourite ?? false,
            collectionIds: cachedBook.collectionIds ?? [],
            personalRating: cachedBook.personalRating,
            dateAdded: cachedBook.dateAdded ?? formDefaults.dateAdded,
            startDate: cachedBook.startDate ?? "",
            currentPage: cachedBook.currentPage,
            targetCompletionDate: cachedBook.targetCompletionDate ?? "",
            readingGoalEnabled: cachedBook.readingGoalEnabled ?? false,
            dailyPageGoal: cachedBook.dailyPageGoal,
            reviewTitle: cachedBook.reviewTitle,
            reviewText: cachedBook.reviewText,
            favouriteQuote: cachedBook.favouriteQuote ?? "",
            privateNote: cachedBook.privateNote ?? "",
          });
          setBookDetails({
            title: cachedBook.bookFields.title,
            description: cachedBook.bookFields.description,
            first_publish_date: cachedBook.bookFields.firstPublished,
            subjects: cachedBook.bookFields.subjects?.split(", ") ?? [],
          });
          setLoading(false);
          return;
        }
        const response = await fetch(`https://openlibrary.org${book.key}.json`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Book details request failed (${response.status}).`);
        }

        const details: BookWork = await response.json();
        setBookDetails(details);
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          return;
        }

        setError(
          fetchError instanceof Error ? fetchError.message : "Unable to load book details.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void fetchBookDetails();
    return () => controller.abort();
  }, [book.key, libraryState.loading, reset, uiUser?.userId]);

  useEffect(() => {
    if (collectionsLoading || collectionsError) return;

    const membershipIds =
      savedBook?.collectionIds ??
      collections
        .filter((collection) =>
          collection.items.some((item) => item.bookId === book.key),
        )
        .map((collection) => collection.id);
    setValue("collectionIds", membershipIds);
  }, [book.key, collections, collectionsError, collectionsLoading, savedBook, setValue]);

  const description =
    typeof bookDetails?.description === "string"
      ? bookDetails.description
      : bookDetails?.description?.value ?? "";

  const bookFieldValues: BookFieldValues = {
    title: bookDetails?.title ?? book.title,
    author: book.author_name?.join(", ") ?? "Unknown author",
    firstPublished:
      bookDetails?.first_publish_date ??
      (book.first_publish_year ? String(book.first_publish_year) : "Unknown"),
    description: description || "No description available",
    subjects: bookDetails?.subjects?.join(", ") ?? "Not available",
  };

  const bookFields: BookField[] = [
    { label: "Title", value: bookFieldValues.title },
    { label: "Authors", value: bookFieldValues.author },
    { label: "First published", value: bookFieldValues.firstPublished },
    { label: "Description", value: bookFieldValues.description },
    { label: "Subjects", value: bookFieldValues.subjects },
  ];

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const isLastStep = activeIndex === tabs.length - 1;

  const onSubmit = async (data: LibraryFormValues) => {
    try {
      if (!uiUser) throw new Error("You must be signed in to save your library.");

      const newCollection = data.createCollection
        ? {
            name: data.collectionName.trim(),
            isPublic: data.collectionIsPublic,
          }
        : undefined;
      const response = await addBookToLibrary({
        userId: uiUser.userId,
        bookId: book.key,
        libraryFields: {
          readingStatus: data.libraryStatus,
          readingFormat: data.readingFormat,
          personalRating: data.personalRating,
          isFavourite: data.favourite,
          currentPage: data.currentPage,
          dateAdded: data.dateAdded,
          readingStartDate: data.startDate ?? "",
          targetCompletionDate: data.targetCompletionDate ?? "",
          reviewTitle: data.reviewTitle,
          reviewText: data.reviewText,
          readingGoalEnabled: data.readingGoalEnabled ?? false,
          dailyPageGoal:
            Number.isFinite(data.dailyPageGoal) && data.dailyPageGoal >= 1
              ? data.dailyPageGoal
              : null,
          favouriteQuote: data.favouriteQuote ?? "",
          privateNote: data.privateNote ?? "",
        },
        ...(!collectionsLoading && !collectionsError
          ? { collectionIds: data.collectionIds ?? [] }
          : {}),
        ...(newCollection ? { newCollection } : {}),
      });
      const savedBook: LibraryBook = {
        key: book.key,
        libraryStatus: data.libraryStatus,
        readingFormat: data.readingFormat,
        favourite: data.favourite,
        collectionIds: response.collectionIds,
        personalRating: data.personalRating,
        dateAdded: data.dateAdded,
        startDate: data.startDate ?? "",
        currentPage: data.currentPage,
        targetCompletionDate: data.targetCompletionDate ?? "",
        readingGoalEnabled: data.readingGoalEnabled ?? false,
        dailyPageGoal:
          Number.isFinite(data.dailyPageGoal) && data.dailyPageGoal >= 1
            ? data.dailyPageGoal
            : undefined,
        reviewTitle: data.reviewTitle,
        reviewText: data.reviewText,
        favouriteQuote: data.favouriteQuote ?? "",
        privateNote: data.privateNote ?? "",
        bookFields: bookFieldValues,
      };
      const cacheUpdated = await saveLibraryBookToState(
        uiUser.userId,
        savedBook,
        response.collectionIds,
        response.createdCollection ?? undefined,
      );
      if (cacheUpdated) toast.success("Book saved to your library.");
      else toast.warning("Saved to your library, but the local detail cache could not be updated.");
      setSaveError(null);
      onClose();
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? `Unable to add this book: ${saveError.message}`
          : "Unable to add this book to your library.",
      );
      setSaveError(
        saveError instanceof Error
          ? `Unable to add this book: ${saveError.message}`
          : "Unable to add this book to your library.",
      );
    }
  };

  const handleStepSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    if (isLastStep) {
      await handleSubmit(onSubmit)(event);
      return;
    }

    event.preventDefault();
    const fieldsToValidate = fieldsByTab[activeTab];
    const isStepValid = fieldsToValidate
      ? await trigger(fieldsToValidate, { shouldFocus: true })
      : true;

    if (isStepValid) {
      setActiveTab(tabs[activeIndex + 1].id);
    }
  };

  const renderActiveTab = () => {
    if (activeTab === "book-details") {
      return (
        <BookDetailsSection
          bookFields={bookFields}
        />
      );
    }

    if (activeTab === "library-and-reading-preferences") {
      return (
        <LibraryPreferencesSection
          register={register}
          errors={errors}
          isCollectionEnabled={isCollectionEnabled}
          collections={collections}
          collectionsLoading={collectionsLoading}
          collectionsError={collectionsError}
        />
      );
    }

    if (activeTab === "reading-progress-and-goals") {
      return (
        <ReadingProgressSection
          register={register}
          errors={errors}
          clearErrors={clearErrors}
          isReadingGoalEnabled={() => getValues("readingGoalEnabled")}
        />
      );
    }

    return <ReviewSection register={register} errors={errors} />;
  };

  return (
    <div
      className="library-form-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="library-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-details-title"
      >
        <button
          type="button"
          className="library-form-close"
          aria-label="Close book details"
          onClick={onClose}
        >
          ×
        </button>

        <h2 id="book-details-title" className="library-form-title">
          Add to your library
        </h2>

        <div className="library-form-tabs" role="tablist" aria-label="Book form sections">
          {tabs.map((tab, index) => (
            <button
              className="tab"
              id={`${tab.id}-tab`}
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`${tab.id}-panel`}
              disabled={index > activeIndex}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-step">{index + 1}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div
          className={`library-form-panel ${activeTab}-panel`}
          id={`${activeTab}-panel`}
          role="tabpanel"
          aria-labelledby={`${activeTab}-tab`}
        >
          {loading && <p role="status">Loading book details...</p>}
          {error && (
            <p className="library-form-error" role="alert">
              {error}
            </p>
          )}
          {saveError && (
            <p className="library-form-error" role="alert">
              {saveError}
            </p>
          )}

          <form onSubmit={handleStepSubmit} noValidate>
            {renderActiveTab()}

            <LibraryFormActions
              activeIndex={activeIndex}
              isLastStep={isLastStep}
              isSubmitting={isSubmitting}
              isStateLoading={libraryState.loading}
              onBack={() => setActiveTab(tabs[activeIndex - 1].id)}
            />
          </form>
        </div>
      </section>
    </div>
  );
}

export default LibraryForm;
