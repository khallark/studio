// /src/config/types/warehouse.ts

import { Timestamp } from "firebase-admin/firestore";

// /{businessId}/warehouses/{warehouseId}
export interface Warehouse {
    id: string;
    name: string;
    address: string;
    storageCapacity: number;
    operationalHours: number;
    defaultGSTstate: string;
    isDeleted: boolean;
    deletedAt?: Timestamp;
    createdBy: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    updatedBy: string;

    stats: {
        totalZones: number;
        totalRacks: number;
        totalShelves: number;
        totalProducts: number;
    };
}

// /{businessId}/zones/{zoneId}
export interface Zone {
    id: string;
    name: string;
    code: string;
    description?: string;
    isDeleted: boolean;
    deletedAt?: Timestamp;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    createdBy: string;
    updatedBy: string;

    warehouseId: string;
    warehouseName: string;

    stats: {
        totalRacks: number;
        totalShelves: number;
        totalProducts: number;
    };
}

// /{businessId}/zones/{zoneId}/logs/{logsId}
export interface ZoneLog {
    type: "created" | "updated" | "deleted" | "restored";
    changes?: {
        [field: string]: { from: any; to: any };
    };
    note?: string;
    timestamp: Timestamp;
    userId: string;
}

// /{businessId}/racks/{rackId}
export interface Rack {
    id: string;
    name: string;
    code: string;
    isDeleted: boolean;
    deletedAt?: Timestamp;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    createdBy: string;
    updatedBy: string;

    warehouseId: string;
    warehouseName: string;

    zoneId: string;
    zoneName: string;
    position: number;

    stats: {
        totalShelves: number;
        totalProducts: number;
    };
}

// /{businessId}/racks/{rackId}/logs/{logId}
export interface RackLog {
    type: "created" | "updated" | "deleted" | "restored" | "moved";
    changes?: {
        [field: string]: { from: any; to: any };
    };
    fromZone?: { id: string; name: string };
    toZone?: { id: string; name: string };
    timestamp: Timestamp;
    userId: string;
}

// /{businessId}/shelves/{shelfId}
export interface Shelf {
    id: string;
    name: string;
    code: string;
    capacity?: number;
    isDeleted: boolean;
    deletedAt?: Timestamp;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    createdBy: string;
    updatedBy: string;

    warehouseId: string;
    warehouseName: string;

    zoneId: string;
    zoneName: string;

    rackId: string;
    rackName: string;
    position: number;

    stats: {
        totalProducts: number;
        currentOccupancy: number;
    };

    coordinates?: {
        aisle: string;
        bay: number;
        level: number;
    };
}

// /{businessId}/shelves/{shelfId}/logs/{logId}
export interface ShelfLog {
    type: "created" | "updated" | "deleted" | "restored" | "moved";
    changes?: {
        [field: string]: { from: any; to: any };
    };
    fromRack?: { id: string; name: string; zoneId: string };
    toRack?: { id: string; name: string; zoneId: string };
    timestamp: Timestamp;
    userId: string;
}

// /{businessId}/placements/{placementId}
// placementId = `${productId}_${shelfId}` (composite ID)
export interface Placement {
    id: string;
    quantity: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    createdBy: string;
    updatedBy: string;
    coordinates?: {
        aisle: string;
        bay: number;
        level: number;
    };
    locationCode?: string;

    productId: string;
    productSKU: string;

    warehouseId: string;
    warehouseName: string;

    zoneId: string;
    zoneName: string;

    rackId: string;
    rackName: string;

    shelfId: string;
    shelfName: string;

    lastMovementReason?: string;
    lastMovementReference?: string;
}

// /{businessId}/placements/{placementId}/logs/{logId}
export interface PlacementLog {
    type: "added" | "removed" | "quantity_adjusted";
    quantity: number;
    quantityBefore?: number;
    quantityAfter?: number;
    relatedMovementId?: string;
    note?: string;
    timestamp: Timestamp;
    userId: string;
}

// /{businessId}/movements/{movementId}
export interface Movement {
    id: string;

    productId: string;
    productSKU: string;

    type: "transfer" | "inbound" | "outbound" | "adjustment";

    from: {
        shelfId: string | null;
        shelfName: string | null;
        rackId: string | null;
        rackName: string | null;
        zoneId: string | null;
        zoneName: string | null;
        warehouseId: string | null;
        warehouseName: string | null;
    };

    to: {
        shelfId: string | null;
        shelfName: string | null;
        rackId: string | null;
        rackName: string | null;
        zoneId: string | null;
        zoneName: string | null;
        warehouseId: string | null;
        warehouseName: string | null;
    };

    quantity: number;
    reason?: string;
    reference?: string;

    timestamp: Timestamp;
    userId: string;
    userName: string;
}
