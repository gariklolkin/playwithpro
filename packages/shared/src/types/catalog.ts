import type { ServiceType } from "../enums/service-type";
import type { ProServiceResponse } from "./pro-profile";
import type { RatingAggregate } from "./review";

/**
 * Filters for the public coach catalog; all optional. A coach matches when
 * they speak at least one selected language and offer at least one active
 * service that is of a selected type and at or below the price cap.
 */
export interface CatalogQuery {
  /** ISO 639-1 spoken languages (any-of). */
  languages?: string[];
  /** Service types (any-of). */
  serviceTypes?: ServiceType[];
  /** Only coaches with a matching active service at or below this price. */
  maxPriceMinor?: number;
  page?: number;
}

export const CATALOG_PAGE_SIZE = 12;

export interface CatalogCoachCard extends RatingAggregate {
  /** ProProfile id — the public coach identifier. */
  id: string;
  displayName: string;
  avatarUrl: string | null;
  languages: string[];
  /** Active services only. */
  services: ProServiceResponse[];
  /** Lowest active service price ("price-from"). */
  priceFromMinor: number;
  currency: string;
  /** Start of the next publicly listable open slot; null when none. */
  nextSlotAt: string | null;
}

export interface CatalogResponse {
  items: CatalogCoachCard[];
  total: number;
  page: number;
  pageSize: number;
}

/** Public profile of a verified coach. */
export interface PublicProProfileResponse extends RatingAggregate {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  languages: string[];
  services: ProServiceResponse[];
}
