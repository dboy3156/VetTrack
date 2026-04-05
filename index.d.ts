import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { ActivityFeed, AnalyticsSummary, BulkDeleteRequest, BulkMoveRequest, BulkResult, CreateEquipmentRequest, CreateFolderRequest, Equipment, ErrorResponse, Folder, HealthStatus, ListLogsParams, ScanEquipmentRequest, ScanLog, TransferLog, UpdateEquipmentRequest, UploadUrlRequest, UploadUrlResponse } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * Returns server health status
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List all folders
 */
export declare const getListFoldersUrl: () => string;
export declare const listFolders: (options?: RequestInit) => Promise<Folder[]>;
export declare const getListFoldersQueryKey: () => readonly ["/api/folders"];
export declare const getListFoldersQueryOptions: <TData = Awaited<ReturnType<typeof listFolders>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFolders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listFolders>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListFoldersQueryResult = NonNullable<Awaited<ReturnType<typeof listFolders>>>;
export type ListFoldersQueryError = ErrorType<unknown>;
/**
 * @summary List all folders
 */
export declare function useListFolders<TData = Awaited<ReturnType<typeof listFolders>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFolders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create a folder
 */
export declare const getCreateFolderUrl: () => string;
export declare const createFolder: (createFolderRequest: CreateFolderRequest, options?: RequestInit) => Promise<Folder>;
export declare const getCreateFolderMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createFolder>>, TError, {
        data: BodyType<CreateFolderRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createFolder>>, TError, {
    data: BodyType<CreateFolderRequest>;
}, TContext>;
export type CreateFolderMutationResult = NonNullable<Awaited<ReturnType<typeof createFolder>>>;
export type CreateFolderMutationBody = BodyType<CreateFolderRequest>;
export type CreateFolderMutationError = ErrorType<unknown>;
/**
 * @summary Create a folder
 */
export declare const useCreateFolder: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createFolder>>, TError, {
        data: BodyType<CreateFolderRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createFolder>>, TError, {
    data: BodyType<CreateFolderRequest>;
}, TContext>;
/**
 * Returns all equipment items
 * @summary List all equipment
 */
export declare const getListEquipmentUrl: () => string;
export declare const listEquipment: (options?: RequestInit) => Promise<Equipment[]>;
export declare const getListEquipmentQueryKey: () => readonly ["/api/equipment"];
export declare const getListEquipmentQueryOptions: <TData = Awaited<ReturnType<typeof listEquipment>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listEquipment>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listEquipment>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListEquipmentQueryResult = NonNullable<Awaited<ReturnType<typeof listEquipment>>>;
export type ListEquipmentQueryError = ErrorType<unknown>;
/**
 * @summary List all equipment
 */
export declare function useListEquipment<TData = Awaited<ReturnType<typeof listEquipment>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listEquipment>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * Creates a new equipment item with an auto-generated ID
 * @summary Create equipment item
 */
export declare const getCreateEquipmentUrl: () => string;
export declare const createEquipment: (createEquipmentRequest: CreateEquipmentRequest, options?: RequestInit) => Promise<Equipment>;
export declare const getCreateEquipmentMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createEquipment>>, TError, {
        data: BodyType<CreateEquipmentRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createEquipment>>, TError, {
    data: BodyType<CreateEquipmentRequest>;
}, TContext>;
export type CreateEquipmentMutationResult = NonNullable<Awaited<ReturnType<typeof createEquipment>>>;
export type CreateEquipmentMutationBody = BodyType<CreateEquipmentRequest>;
export type CreateEquipmentMutationError = ErrorType<unknown>;
/**
 * @summary Create equipment item
 */
export declare const useCreateEquipment: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createEquipment>>, TError, {
        data: BodyType<CreateEquipmentRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createEquipment>>, TError, {
    data: BodyType<CreateEquipmentRequest>;
}, TContext>;
/**
 * @summary Get equipment by ID
 */
export declare const getGetEquipmentUrl: (id: string) => string;
export declare const getEquipment: (id: string, options?: RequestInit) => Promise<Equipment>;
export declare const getGetEquipmentQueryKey: (id: string) => readonly [`/api/equipment/${string}`];
export declare const getGetEquipmentQueryOptions: <TData = Awaited<ReturnType<typeof getEquipment>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEquipment>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getEquipment>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetEquipmentQueryResult = NonNullable<Awaited<ReturnType<typeof getEquipment>>>;
export type GetEquipmentQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get equipment by ID
 */
export declare function useGetEquipment<TData = Awaited<ReturnType<typeof getEquipment>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEquipment>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * Updates equipment profile fields (serial number, model, manufacturer, purchase date, location, maintenance interval)
 * @summary Update equipment profile
 */
export declare const getUpdateEquipmentUrl: (id: string) => string;
export declare const updateEquipment: (id: string, updateEquipmentRequest: UpdateEquipmentRequest, options?: RequestInit) => Promise<Equipment>;
export declare const getUpdateEquipmentMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateEquipment>>, TError, {
        id: string;
        data: BodyType<UpdateEquipmentRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateEquipment>>, TError, {
    id: string;
    data: BodyType<UpdateEquipmentRequest>;
}, TContext>;
export type UpdateEquipmentMutationResult = NonNullable<Awaited<ReturnType<typeof updateEquipment>>>;
export type UpdateEquipmentMutationBody = BodyType<UpdateEquipmentRequest>;
export type UpdateEquipmentMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Update equipment profile
 */
export declare const useUpdateEquipment: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateEquipment>>, TError, {
        id: string;
        data: BodyType<UpdateEquipmentRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateEquipment>>, TError, {
    id: string;
    data: BodyType<UpdateEquipmentRequest>;
}, TContext>;
/**
 * Permanently deletes an equipment item and its scan logs
 * @summary Delete equipment item
 */
export declare const getDeleteEquipmentUrl: (id: string) => string;
export declare const deleteEquipment: (id: string, options?: RequestInit) => Promise<void>;
export declare const getDeleteEquipmentMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteEquipment>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteEquipment>>, TError, {
    id: string;
}, TContext>;
export type DeleteEquipmentMutationResult = NonNullable<Awaited<ReturnType<typeof deleteEquipment>>>;
export type DeleteEquipmentMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Delete equipment item
 */
export declare const useDeleteEquipment: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteEquipment>>, TError, {
        id: string;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteEquipment>>, TError, {
    id: string;
}, TContext>;
/**
 * Permanently deletes multiple equipment items and their scan/transfer logs.
 * @summary Delete multiple equipment items
 */
export declare const getBulkDeleteEquipmentUrl: () => string;
export declare const bulkDeleteEquipment: (bulkDeleteRequest: BulkDeleteRequest, options?: RequestInit) => Promise<BulkResult>;
export declare const getBulkDeleteEquipmentMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkDeleteEquipment>>, TError, {
        data: BodyType<BulkDeleteRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof bulkDeleteEquipment>>, TError, {
    data: BodyType<BulkDeleteRequest>;
}, TContext>;
export type BulkDeleteEquipmentMutationResult = NonNullable<Awaited<ReturnType<typeof bulkDeleteEquipment>>>;
export type BulkDeleteEquipmentMutationBody = BodyType<BulkDeleteRequest>;
export type BulkDeleteEquipmentMutationError = ErrorType<unknown>;
/**
 * @summary Delete multiple equipment items
 */
export declare const useBulkDeleteEquipment: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkDeleteEquipment>>, TError, {
        data: BodyType<BulkDeleteRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof bulkDeleteEquipment>>, TError, {
    data: BodyType<BulkDeleteRequest>;
}, TContext>;
/**
 * Reassigns multiple equipment items to the specified folder, logging transfers.
 * @summary Move multiple equipment items to a folder
 */
export declare const getBulkMoveEquipmentUrl: () => string;
export declare const bulkMoveEquipment: (bulkMoveRequest: BulkMoveRequest, options?: RequestInit) => Promise<BulkResult>;
export declare const getBulkMoveEquipmentMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkMoveEquipment>>, TError, {
        data: BodyType<BulkMoveRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof bulkMoveEquipment>>, TError, {
    data: BodyType<BulkMoveRequest>;
}, TContext>;
export type BulkMoveEquipmentMutationResult = NonNullable<Awaited<ReturnType<typeof bulkMoveEquipment>>>;
export type BulkMoveEquipmentMutationBody = BodyType<BulkMoveRequest>;
export type BulkMoveEquipmentMutationError = ErrorType<unknown>;
/**
 * @summary Move multiple equipment items to a folder
 */
export declare const useBulkMoveEquipment: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof bulkMoveEquipment>>, TError, {
        data: BodyType<BulkMoveRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof bulkMoveEquipment>>, TError, {
    data: BodyType<BulkMoveRequest>;
}, TContext>;
/**
 * Updates lastSeen, lastStatus, and (if maintenance) lastMaintenanceDate; appends log
 * @summary Record a QR scan with status
 */
export declare const getScanEquipmentUrl: (id: string) => string;
export declare const scanEquipment: (id: string, scanEquipmentRequest: ScanEquipmentRequest, options?: RequestInit) => Promise<Equipment>;
export declare const getScanEquipmentMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof scanEquipment>>, TError, {
        id: string;
        data: BodyType<ScanEquipmentRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof scanEquipment>>, TError, {
    id: string;
    data: BodyType<ScanEquipmentRequest>;
}, TContext>;
export type ScanEquipmentMutationResult = NonNullable<Awaited<ReturnType<typeof scanEquipment>>>;
export type ScanEquipmentMutationBody = BodyType<ScanEquipmentRequest>;
export type ScanEquipmentMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Record a QR scan with status
 */
export declare const useScanEquipment: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof scanEquipment>>, TError, {
        id: string;
        data: BodyType<ScanEquipmentRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof scanEquipment>>, TError, {
    id: string;
    data: BodyType<ScanEquipmentRequest>;
}, TContext>;
/**
 * @summary Get scan history for equipment
 */
export declare const getGetEquipmentLogsUrl: (id: string) => string;
export declare const getEquipmentLogs: (id: string, options?: RequestInit) => Promise<ScanLog[]>;
export declare const getGetEquipmentLogsQueryKey: (id: string) => readonly [`/api/equipment/${string}/logs`];
export declare const getGetEquipmentLogsQueryOptions: <TData = Awaited<ReturnType<typeof getEquipmentLogs>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEquipmentLogs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getEquipmentLogs>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetEquipmentLogsQueryResult = NonNullable<Awaited<ReturnType<typeof getEquipmentLogs>>>;
export type GetEquipmentLogsQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get scan history for equipment
 */
export declare function useGetEquipmentLogs<TData = Awaited<ReturnType<typeof getEquipmentLogs>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEquipmentLogs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * Returns chronological list of folder transfers for this equipment item.
 * @summary Get transfer history for equipment
 */
export declare const getGetEquipmentTransfersUrl: (id: string) => string;
export declare const getEquipmentTransfers: (id: string, options?: RequestInit) => Promise<TransferLog[]>;
export declare const getGetEquipmentTransfersQueryKey: (id: string) => readonly [`/api/equipment/${string}/transfers`];
export declare const getGetEquipmentTransfersQueryOptions: <TData = Awaited<ReturnType<typeof getEquipmentTransfers>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEquipmentTransfers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getEquipmentTransfers>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetEquipmentTransfersQueryResult = NonNullable<Awaited<ReturnType<typeof getEquipmentTransfers>>>;
export type GetEquipmentTransfersQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get transfer history for equipment
 */
export declare function useGetEquipmentTransfers<TData = Awaited<ReturnType<typeof getEquipmentTransfers>>, TError = ErrorType<ErrorResponse>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getEquipmentTransfers>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * Returns scan logs across all equipment, most recent first, with cursor-based pagination.
 * @summary Global activity feed
 */
export declare const getListLogsUrl: (params?: ListLogsParams) => string;
export declare const listLogs: (params?: ListLogsParams, options?: RequestInit) => Promise<ActivityFeed>;
export declare const getListLogsQueryKey: (params?: ListLogsParams) => readonly ["/api/logs", ...ListLogsParams[]];
export declare const getListLogsQueryOptions: <TData = Awaited<ReturnType<typeof listLogs>>, TError = ErrorType<unknown>>(params?: ListLogsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listLogs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listLogs>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListLogsQueryResult = NonNullable<Awaited<ReturnType<typeof listLogs>>>;
export type ListLogsQueryError = ErrorType<unknown>;
/**
 * @summary Global activity feed
 */
export declare function useListLogs<TData = Awaited<ReturnType<typeof listLogs>>, TError = ErrorType<unknown>>(params?: ListLogsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listLogs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * Returns aggregated analytics data including scan activity over 30 days, equipment status breakdown, maintenance compliance, and top problem equipment.
 * @summary Get dashboard analytics summary
 */
export declare const getGetAnalyticsSummaryUrl: () => string;
export declare const getAnalyticsSummary: (options?: RequestInit) => Promise<AnalyticsSummary>;
export declare const getGetAnalyticsSummaryQueryKey: () => readonly ["/api/analytics/summary"];
export declare const getGetAnalyticsSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getAnalyticsSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAnalyticsSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getAnalyticsSummary>>>;
export type GetAnalyticsSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Get dashboard analytics summary
 */
export declare function useGetAnalyticsSummary<TData = Awaited<ReturnType<typeof getAnalyticsSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * Returns a presigned GCS URL for direct upload. The client sends JSON
metadata here, then uploads the file directly to the returned URL.

 * @summary Request a presigned URL for file upload
 */
export declare const getRequestUploadUrlUrl: () => string;
export declare const requestUploadUrl: (uploadUrlRequest: UploadUrlRequest, options?: RequestInit) => Promise<UploadUrlResponse>;
export declare const getRequestUploadUrlMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof requestUploadUrl>>, TError, {
        data: BodyType<UploadUrlRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof requestUploadUrl>>, TError, {
    data: BodyType<UploadUrlRequest>;
}, TContext>;
export type RequestUploadUrlMutationResult = NonNullable<Awaited<ReturnType<typeof requestUploadUrl>>>;
export type RequestUploadUrlMutationBody = BodyType<UploadUrlRequest>;
export type RequestUploadUrlMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Request a presigned URL for file upload
 */
export declare const useRequestUploadUrl: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof requestUploadUrl>>, TError, {
        data: BodyType<UploadUrlRequest>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof requestUploadUrl>>, TError, {
    data: BodyType<UploadUrlRequest>;
}, TContext>;
/**
 * @summary Serve a public asset from PUBLIC_OBJECT_SEARCH_PATHS
 */
export declare const getGetPublicObjectUrl: (filePath: string) => string;
export declare const getPublicObject: (filePath: string, options?: RequestInit) => Promise<Blob>;
export declare const getGetPublicObjectQueryKey: (filePath: string) => readonly [`/api/storage/public-objects/${string}`];
export declare const getGetPublicObjectQueryOptions: <TData = Awaited<ReturnType<typeof getPublicObject>>, TError = ErrorType<ErrorResponse>>(filePath: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPublicObject>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getPublicObject>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetPublicObjectQueryResult = NonNullable<Awaited<ReturnType<typeof getPublicObject>>>;
export type GetPublicObjectQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Serve a public asset from PUBLIC_OBJECT_SEARCH_PATHS
 */
export declare function useGetPublicObject<TData = Awaited<ReturnType<typeof getPublicObject>>, TError = ErrorType<ErrorResponse>>(filePath: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getPublicObject>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Serve an object entity from PRIVATE_OBJECT_DIR
 */
export declare const getGetStorageObjectUrl: (objectPath: string) => string;
export declare const getStorageObject: (objectPath: string, options?: RequestInit) => Promise<Blob>;
export declare const getGetStorageObjectQueryKey: (objectPath: string) => readonly [`/api/storage/objects/${string}`];
export declare const getGetStorageObjectQueryOptions: <TData = Awaited<ReturnType<typeof getStorageObject>>, TError = ErrorType<ErrorResponse>>(objectPath: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStorageObject>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getStorageObject>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetStorageObjectQueryResult = NonNullable<Awaited<ReturnType<typeof getStorageObject>>>;
export type GetStorageObjectQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Serve an object entity from PRIVATE_OBJECT_DIR
 */
export declare function useGetStorageObject<TData = Awaited<ReturnType<typeof getStorageObject>>, TError = ErrorType<ErrorResponse>>(objectPath: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getStorageObject>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map