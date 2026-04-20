export interface Order {
    id: string;
    storeId: string;
    orderId: number;
    name: string;
    email: string;
    createdAt: ISODateString;
    updatedAt: Timestamp;
    financialStatus: FinancialStatus;
    fulfillmentStatus: FulfillmentStatusEnum;
    totalPrice: number;
    currency: Currency;
    vendors: string[];
    raw: Raw;
    lastWebhookTopic: Topic;
    isDeleted: boolean;
    createdByTopic: Topic;
    receivedAt: Timestamp;
    newAt: Timestamp;
    customStatus: CustomStatusEnum;
    lastStatusUpdate: Timestamp;
    customStatusesLogs: CustomStatusesLog[];
    confirmedAt?: Timestamp;
    whatsapp_messages: string[];
    updatedByTopic?: Topic;
    cancelledAt?: Timestamp;
    pickupReadyAt?: Timestamp;
    pickupReady?: boolean;
    bdClusterCode?: string | null;
    bdDestinationLocation?: string;
    bdDestinationArea?: string;
    courier?: Courier;
    shippingMode?: ShippingMode;
    awb?: string;
    courierProvider?: Courier;
    readyToDispatchAt?: Timestamp;
    lastPackedAt?: Timestamp;
    packingVidUrls?: PackingVidURL[];
    cancellationRequestedAt?: Timestamp;
    lastUpdatedBy?: LastUpdatedBy;
    lastUpdatedAt?: Timestamp;
    dispatchedAt?: Timestamp;
    inTransitAt?: Timestamp;
    deliveredAt?: Timestamp;
    bluedartdeliveredtime?: Timestamp;
    return_request_date?: Timestamp;
    returnItemsVariantIds?: number[];
    booked_return_reason?: string;
    dtoRequestedAt?: Timestamp;
    booked_return_images?: string[];
    courierReverseProvider?: Courier;
    courier_reverse?: Courier;
    awb_reverse?: string;
    dtoBookedAt?: Timestamp;
    outForDeliveryAt?: Timestamp;
    dtoInTransitAt?: Timestamp;
    closedAt?: Timestamp;
    dtoDeliveredAt?: Timestamp;
    unboxing_video_path?: string;
    pendingRefundsAt?: Timestamp;
    refundMethod?: RefundMethod;
    refundedAmount?: number;
    dtoRefundedAt?: Timestamp;
    rtoInTransitAt?: Timestamp;
    tags_rtoInTransit?: TagsRtoInTransit[];
    rtoDeliveredAt?: Timestamp;
    rtoClosedAt?: Timestamp;
    lostAt?: Timestamp;
}

export interface Timestamp {
    _seconds: number;
    _nanoseconds: number;
}

export enum Courier {
    BlueDart = "Blue Dart",
    Delhivery = "Delhivery",
    Dtdc = "DTDC",
}

export enum Topic {
    OrdersCreate = "orders/create",
    OrdersUpdated = "orders/updated",
}

export enum Currency {
    Inr = "INR",
}

export enum CustomStatusEnum {
    New = "New",
    Confirmed = "Confirmed",
    ReadyToDispatch = "Ready To Dispatch",
    Dispatched = "Dispatched",
    InTransit = "In Transit",
    OutForDelivery = "Out For Delivery",
    Delivered = "Delivered",
    RTOInTransit = "RTO In Transit",
    RTODelivered = "RTO Delivered",
    DTORequested = "DTO Requested",
    DTOBooked = "DTO Booked",
    DTOInTransit = "DTO In Transit",
    DTODelivered = "DTO Delivered",
    PendingRefunds = "Pending Refunds",
    DTORefunded = "DTO Refunded",
    Closed = "Closed",
    RTOClosed = "RTO Closed",
    Lost = "Lost",
    CancellationRequested = "Cancellation Requested",
    Cancelled = "Cancelled",
}

export interface CustomStatusesLog {
    status: string;
    createdAt: Timestamp;
    remarks: string;
}

export enum FinancialStatus {
    Paid = "paid",
    PartiallyPaid = "partially_paid",
    Pending = "pending",
    Refunded = "refunded",
    Voided = "voided",
}

export enum FulfillmentStatusEnum {
    Fulfilled = "fulfilled",
    Restocked = "restocked",
    Unfulfilled = "unfulfilled",
}

export interface LastUpdatedBy {
    uid: string;
    email: string;
    displayName: string;
}

export interface PackingVidURL {
    packingVidUrl: string;
    packedAt: Timestamp;
}

export interface Raw {
    id: number;
    admin_graphql_api_id: string;
    app_id: number;
    browser_ip: string | null;
    buyer_accepts_marketing: boolean;
    cancel_reason: string | null;
    cancelled_at: Date | null;
    cart_token: string | null;
    checkout_id: number | null;
    checkout_token: string | null;
    client_details: ClientDetails | null;
    closed_at: ISODateString | null;
    company?: string | null;
    confirmation_number: string;
    confirmed: boolean;
    contact_email: string | null;
    created_at: ISODateString;
    currency: Currency;
    current_shipping_price_set: Set;
    current_subtotal_price: string;
    current_subtotal_price_set: Set;
    current_total_additional_fees_set: null;
    current_total_discounts: string;
    current_total_discounts_set: Set;
    current_total_duties_set: null;
    current_total_price: string;
    current_total_price_set: Set;
    current_total_tax: string;
    current_total_tax_set: Set;
    customer_locale: string | null;
    device_id: null;
    discount_codes: DiscountCode[];
    duties_included: boolean;
    email: string;
    estimated_taxes: boolean;
    financial_status: FinancialStatus;
    fulfillment_status: FulfillmentStatusEnum | null;
    landing_site: string | null;
    landing_site_ref: null;
    location_id: null;
    merchant_business_entity_id: string;
    merchant_of_record_app_id: null;
    name: string;
    note: string | null;
    note_attributes: NoteAttribute[];
    number: number;
    order_number: number;
    order_status_url: string;
    original_total_additional_fees_set: null;
    original_total_duties_set: null;
    payment_gateway_names: string[];
    phone: string | null;
    po_number: null;
    presentment_currency: Currency;
    processed_at: ISODateString;
    reference: null;
    referring_site: string | null;
    source_identifier: null;
    source_name: string;
    source_url: null;
    subtotal_price: string;
    subtotal_price_set: Set;
    tags: string;
    tax_exempt: boolean;
    tax_lines: TaxLine[];
    taxes_included: boolean;
    test: boolean;
    token: string;
    total_cash_rounding_payment_adjustment_set: Set;
    total_cash_rounding_refund_adjustment_set: Set;
    total_discounts: string;
    total_discounts_set: Set;
    total_line_items_price: string;
    total_line_items_price_set: Set;
    total_outstanding: string;
    total_price: string;
    total_price_set: Set;
    total_shipping_price_set: Set;
    total_tax: string;
    total_tax_set: Set;
    total_tip_received: string;
    total_weight: number;
    updated_at: ISODateString;
    user_id: number | null;
    billing_address: Address;
    customer: Customer;
    discount_applications: DiscountApplication[];
    fulfillments: Fulfillment[];
    line_items: LineItem[];
    payment_terms: PaymentTerms | null;
    refunds: Refund[];
    shipping_address: Address;
    shipping_lines: ShippingLine[];
    returns: any[];
    line_item_groups: any[];
}

export interface Address {
    first_name: string;
    address1: string;
    phone: string | null;
    city: string | null;
    zip: string;
    province: string | null;
    country: string;
    last_name: string | null;
    address2: string | null;
    company: string | null;
    latitude?: number;
    longitude?: number;
    name: string;
    country_code: string;
    province_code: string | null;
    id?: number;
    customer_id?: number;
    country_name?: string;
    default?: boolean;
}

export interface ClientDetails {
    accept_language: string | null;
    browser_height: null;
    browser_ip: string;
    browser_width: null;
    session_hash: null;
    user_agent: string;
}

export interface Set {
    shop_money: Money;
    presentment_money: Money;
}

export interface Money {
    amount: string;
    currency_code: Currency;
}

export interface Customer {
    id: number;
    created_at: ISODateString;
    updated_at: ISODateString;
    first_name: string;
    last_name: string | null;
    state: string;
    note: string | null;
    verified_email: boolean;
    multipass_identifier: null;
    tax_exempt: boolean;
    email: string | null;
    phone: string | null;
    currency: Currency;
    tax_exemptions: any[];
    admin_graphql_api_id: string;
    default_address: Address;
}

export interface DiscountApplication {
    target_type: string;
    type: string;
    value: string;
    value_type: string;
    allocation_method: string;
    target_selection: string;
    title?: string;
    description?: string;
    code?: string;
}

export interface DiscountCode {
    code: string;
    amount: string;
    type: string;
}

export interface Fulfillment {
    id: number;
    admin_graphql_api_id: string;
    created_at: ISODateString;
    location_id: number;
    name: string;
    order_id: number;
    origin_address: OriginAddress;
    receipt: OriginAddress;
    service: string;
    shipment_status: null;
    status: string;
    tracking_company: Courier;
    tracking_number: string;
    tracking_numbers: string[];
    tracking_url: string;
    tracking_urls: string[];
    updated_at: ISODateString;
    line_items: LineItem[];
}

export interface LineItem {
    id: number;
    admin_graphql_api_id: string;
    attributed_staffs: any[];
    current_quantity: number;
    fulfillable_quantity: number;
    fulfillment_service: string;
    fulfillment_status: FulfillmentStatusEnum | null;
    gift_card: boolean;
    grams: number;
    name: string;
    price: string;
    price_set: Set;
    product_exists: boolean;
    product_id: number;
    properties: any[];
    quantity: number;
    requires_shipping: boolean;
    sku: string;
    taxable: boolean;
    title: string;
    total_discount: string;
    total_discount_set: Set;
    variant_id: number;
    variant_inventory_management: string | null;
    variant_title: string;
    vendor: string;
    tax_lines: TaxLine[];
    duties: any[];
    discount_allocations: DiscountAllocation[];
    sales_line_item_group_id?: null;
    refundedAmount?: number;
    qc_status?: QcStatus;
}

export interface DiscountAllocation {
    amount: string;
    amount_set: Set;
    discount_application_index: number;
}

export enum QcStatus {
    NotReceived = "Not Received",
    QCFail = "QC Fail",
    QCPass = "QC Pass",
}

export interface TaxLine {
    channel_liable: boolean;
    price: string;
    price_set: Set;
    rate: number;
    title: TaxLineTitle;
}

export enum TaxLineTitle {
    Cgst = "CGST",
    Igst = "IGST",
    Sgst = "SGST",
}

export interface OriginAddress {
}

export interface NoteAttribute {
    name: string;
    value: string;
}

export interface PaymentTerms {
    id: number;
    created_at: ISODateString;
    due_in_days: null;
    payment_schedules: any[];
    payment_terms_name: string;
    payment_terms_type: string;
    updated_at: ISODateString;
}

export interface Refund {
    id: number;
    admin_graphql_api_id: string;
    created_at: ISODateString;
    note: string | null;
    order_id: number;
    processed_at: ISODateString;
    restock: boolean;
    total_duties_set: Set;
    user_id: number;
    order_adjustments: OrderAdjustment[];
    transactions: Transaction[];
    refund_line_items: RefundLineItem[];
    duties: any[];
}

export interface OrderAdjustment {
    id: number;
    amount: string;
    amount_set: Set;
    kind: string;
    order_id: number;
    reason: string;
    refund_id: number;
    tax_amount: string;
    tax_amount_set: Set;
}

export interface RefundLineItem {
    id: number;
    line_item_id: number;
    location_id: number | null;
    quantity: number;
    restock_type: string;
    subtotal: number;
    subtotal_set: Set;
    total_tax: number;
    total_tax_set: Set;
    line_item: LineItem;
}

export interface Transaction {
    id: number;
    admin_graphql_api_id: string;
    amount: string;
    authorization: string | null;
    created_at: ISODateString;
    currency: Currency;
    device_id: null;
    error_code: null;
    gateway: string;
    kind: string;
    location_id: null;
    message: string;
    order_id: number;
    parent_id: number | null;
    payment_id: string;
    processed_at: ISODateString;
    receipt: Receipt;
    source_name: string;
    status: string;
    test: boolean;
    user_id: number;
}

export interface Receipt {
    account_id?: number;
    credit_operation_id?: number;
}

export interface ShippingLine {
    id: number;
    carrier_identifier: null;
    code: string;
    current_discounted_price_set: Set;
    discounted_price: string;
    discounted_price_set: Set;
    is_removed: boolean;
    phone: null;
    price: string;
    price_set: Set;
    requested_fulfillment_service_id: null;
    source: string | null;
    title: string;
    tax_lines: any[];
    discount_allocations: any[];
}


export enum RefundMethod {
    Manual = "manual",
    StoreCredit = "store_credit",
}

export enum ShippingMode {
    Express = "Express",
    Surface = "Surface",
}

export enum TagsRtoInTransit {
    ReAttempt = "Re-attempt",
    Refused = "Refused",
}

type ISODateString = string;