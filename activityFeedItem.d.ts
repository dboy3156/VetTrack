openapi: 3.1.0
info:
  title: Api
  version: 0.1.0
  description: Equipment QR Code Tracker API
servers:
  - url: /api
    description: Base API path
tags:
  - name: health
    description: Health operations
  - name: equipment
    description: Equipment tracking operations
  - name: folders
    description: Folder/category operations
  - name: Storage
    description: Object storage upload and serving endpoints.
  - name: logs
    description: Global activity feed
  - name: analytics
    description: Dashboard analytics and summary data
  - name: users
    description: User management (admin only)
security:
  - cookieAuth: []
paths:
  /healthz:
    get:
      operationId: healthCheck
      tags: [health]
      summary: Health check
      description: Returns server health status
      responses:
        "200":
          description: Healthy
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthStatus"

  /folders:
    get:
      operationId: listFolders
      tags: [folders]
      summary: List all folders
      responses:
        "200":
          description: List of folders
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Folder"
    post:
      operationId: createFolder
      tags: [folders]
      summary: Create a folder
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateFolderRequest"
      responses:
        "201":
          description: Folder created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Folder"

  /equipment:
    get:
      operationId: listEquipment
      tags: [equipment]
      summary: List all equipment
      description: Returns all equipment items
      responses:
        "200":
          description: List of equipment
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Equipment"
    post:
      operationId: createEquipment
      tags: [equipment]
      summary: Create equipment item
      description: Creates a new equipment item with an auto-generated ID
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateEquipmentRequest"
      responses:
        "201":
          description: Equipment created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Equipment"

  /equipment/{id}:
    get:
      operationId: getEquipment
      tags: [equipment]
      summary: Get equipment by ID
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Equipment found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Equipment"
        "404":
          description: Equipment not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
    patch:
      operationId: updateEquipment
      tags: [equipment]
      summary: Update equipment profile
      description: Updates equipment profile fields (serial number, model, manufacturer, purchase date, location, maintenance interval)
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UpdateEquipmentRequest"
      responses:
        "200":
          description: Equipment updated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Equipment"
        "404":
          description: Equipment not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

    delete:
      operationId: deleteEquipment
      tags: [equipment]
      summary: Delete equipment item
      description: Permanently deletes an equipment item and its scan logs
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "204":
          description: Equipment deleted
        "404":
          description: Equipment not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /equipment/bulk-delete:
    post:
      operationId: bulkDeleteEquipment
      tags: [equipment]
      summary: Delete multiple equipment items
      description: Permanently deletes multiple equipment items and their scan/transfer logs.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/BulkDeleteRequest"
      responses:
        "200":
          description: Bulk delete result
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/BulkResult"

  /equipment/bulk-move:
    post:
      operationId: bulkMoveEquipment
      tags: [equipment]
      summary: Move multiple equipment items to a folder
      description: Reassigns multiple equipment items to the specified folder, logging transfers.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/BulkMoveRequest"
      responses:
        "200":
          description: Bulk move result
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/BulkResult"

  /equipment/{id}/scan:
    post:
      operationId: scanEquipment
      tags: [equipment]
      summary: Record a QR scan with status
      description: Updates lastSeen, lastStatus, and (if maintenance) lastMaintenanceDate; appends log
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ScanEquipmentRequest"
      responses:
        "200":
          description: Scan recorded
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Equipment"
        "404":
          description: Equipment not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /equipment/{id}/logs:
    get:
      operationId: getEquipmentLogs
      tags: [equipment]
      summary: Get scan history for equipment
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Scan log entries
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/ScanLog"
        "404":
          description: Equipment not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /equipment/{id}/transfers:
    get:
      operationId: getEquipmentTransfers
      tags: [equipment]
      summary: Get transfer history for equipment
      description: Returns chronological list of folder transfers for this equipment item.
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Transfer log entries
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/TransferLog"
        "404":
          description: Equipment not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /logs:
    get:
      operationId: listLogs
      tags: [logs]
      summary: Global activity feed
      description: Returns scan logs across all equipment, most recent first, with cursor-based pagination.
      parameters:
        - name: cursor
          in: query
          required: false
          schema:
            type: string
          description: Opaque pagination cursor returned as nextCursor from a previous response. Do not construct manually.
      responses:
        "200":
          description: Paginated activity feed
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ActivityFeed"

  /analytics/summary:
    get:
      operationId: getAnalyticsSummary
      tags: [analytics]
      summary: Get dashboard analytics summary
      description: Returns aggregated analytics data including scan activity over 30 days, equipment status breakdown, maintenance compliance, and top problem equipment.
      responses:
        "200":
          description: Analytics summary data
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AnalyticsSummary"

  /storage/uploads/request-url:
    post:
      tags: [Storage]
      operationId: requestUploadUrl
      summary: Request a presigned URL for file upload
      description: |
        Returns a presigned GCS URL for direct upload. The client sends JSON
        metadata here, then uploads the file directly to the returned URL.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UploadUrlRequest'
      responses:
        '200':
          description: Presigned upload URL generated.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UploadUrlResponse'
        '400':
          description: Missing or invalid required fields.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '500':
          description: Failed to generate upload URL.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
  /storage/public-objects/{filePath}:
    get:
      tags: [Storage]
      operationId: getPublicObject
      summary: Serve a public asset from PUBLIC_OBJECT_SEARCH_PATHS
      parameters:
        - name: filePath
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Object content streamed with correct Content-Type.
          content:
            '*/*':
              schema:
                type: string
                format: binary
        '404':
          description: File not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
  /storage/objects/{objectPath}:
    get:
      tags: [Storage]
      operationId: getStorageObject
      summary: Serve an object entity from PRIVATE_OBJECT_DIR
      parameters:
        - name: objectPath
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Object content streamed with correct Content-Type.
          content:
            '*/*':
              schema:
                type: string
                format: binary
        '404':
          description: Object not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /users/me:
    get:
      operationId: getCurrentUser
      tags: [users]
      summary: Get current authenticated user
      security:
        - cookieAuth: []
      responses:
        "200":
          description: Current user info
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/UserMe"
        "401":
          description: Unauthorized
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /users:
    get:
      operationId: listUsers
      tags: [users]
      summary: List all users (admin only)
      security:
        - cookieAuth: []
      responses:
        "200":
          description: List of users
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/UserRecord"
        "401":
          description: Unauthorized
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "403":
          description: Forbidden
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /users/{clerkId}/role:
    patch:
      operationId: updateUserRole
      tags: [users]
      summary: Update user role (admin only)
      security:
        - cookieAuth: []
      parameters:
        - name: clerkId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UpdateUserRoleRequest"
      responses:
        "200":
          description: Updated user record
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/UserRecord"
        "401":
          description: Unauthorized
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "403":
          description: Forbidden
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "404":
          description: User not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

components:
  securitySchemes:
    cookieAuth:
      type: apiKey
      in: cookie
      name: __session
  schemas:
    HealthStatus:
      type: object
      properties:
        status:
          type: string
      required:
        - status

    Folder:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        createdAt:
          type: string
          format: date-time
      required:
        - id
        - name
        - createdAt

    CreateFolderRequest:
      type: object
      properties:
        name:
          type: string
          minLength: 1
      required:
        - name

    Equipment:
      type: object
      properties:
        id:
          type: string
          description: Auto-generated unique ID
        name:
          type: string
          description: Equipment name
        serialNumber:
          type: string
          nullable: true
          description: Serial number
        model:
          type: string
          nullable: true
          description: Model name/number
        manufacturer:
          type: string
          nullable: true
          description: Manufacturer or brand
        purchaseDate:
          type: string
          format: date-time
          nullable: true
          description: Date the equipment was purchased
        location:
          type: string
          nullable: true
          description: Physical location of the equipment
        category:
          type: string
          nullable: true
          description: Equipment category (e.g. Surgical Instruments, Diagnostic Imaging)
        folderId:
          type: string
          nullable: true
          description: Folder this equipment belongs to
        lastSeen:
          type: string
          format: date-time
          nullable: true
          description: Last time the QR code was scanned
        lastStatus:
          type: string
          nullable: true
          description: Status set at last scan (ok, issue, maintenance)
        lastMaintenanceDate:
          type: string
          format: date-time
          nullable: true
          description: Date of last maintenance scan
        maintenanceIntervalDays:
          type: integer
          nullable: true
          description: How often maintenance should occur (days); null means not configured
        createdAt:
          type: string
          format: date-time
          description: When the equipment was created
      required:
        - id
        - name
        - createdAt

    CreateEquipmentRequest:
      type: object
      properties:
        name:
          type: string
          description: Equipment name
        serialNumber:
          type: string
          nullable: true
          description: Serial number
        model:
          type: string
          nullable: true
          description: Model name/number
        manufacturer:
          type: string
          nullable: true
          description: Manufacturer or brand
        purchaseDate:
          type: string
          format: date-time
          nullable: true
          description: Purchase date
        location:
          type: string
          nullable: true
          description: Physical location
        category:
          type: string
          nullable: true
          description: Equipment category
        folderId:
          type: string
          nullable: true
          description: Optional folder to assign the equipment to
      required:
        - name

    UpdateEquipmentRequest:
      type: object
      properties:
        maintenanceIntervalDays:
          type: integer
          nullable: true
          description: Maintenance interval in days; null to clear
        serialNumber:
          type: string
          nullable: true
          description: Serial number
        model:
          type: string
          nullable: true
          description: Model name/number
        manufacturer:
          type: string
          nullable: true
          description: Manufacturer or brand
        purchaseDate:
          type: string
          format: date-time
          nullable: true
          description: Purchase date
        location:
          type: string
          nullable: true
          description: Physical location
        category:
          type: string
          nullable: true
          description: Equipment category
        folderId:
          type: string
          nullable: true
          description: Folder to assign the equipment to; null to unassign

    ScanEquipmentRequest:
      type: object
      properties:
        status:
          type: string
          enum: [ok, issue, maintenance, sterilized]
          description: Status selected after scanning
        note:
          type: string
          nullable: true
          description: Optional note about the scan
        photoUrl:
          type: string
          nullable: true
          description: Optional photo URL from object storage
      required:
        - status

    ScanLog:
      type: object
      properties:
        id:
          type: string
        equipmentId:
          type: string
        status:
          type: string
        note:
          type: string
          nullable: true
        photoUrl:
          type: string
          nullable: true
        scannedBy:
          type: string
          nullable: true
          description: Clerk user ID of the user who performed the scan
        timestamp:
          type: string
          format: date-time
      required:
        - id
        - equipmentId
        - status
        - timestamp

    UserRecord:
      type: object
      properties:
        clerkId:
          type: string
          description: Clerk user ID (primary key)
        role:
          type: string
          enum: [admin, technician]
          description: User role
        createdAt:
          type: string
          format: date-time
          description: When the user first signed in
      required: [clerkId, role, createdAt]

    UserMe:
      type: object
      properties:
        clerkId:
          type: string
        role:
          type: string
          enum: [admin, technician]
      required: [clerkId, role]

    UpdateUserRoleRequest:
      type: object
      properties:
        role:
          type: string
          enum: [admin, technician]
      required: [role]

    UploadUrlRequest:
      type: object
      required: [name, size, contentType]
      properties:
        name:
          type: string
          minLength: 1
          description: Original file name.
        size:
          type: integer
          minimum: 1
          description: File size in bytes.
        contentType:
          type: string
          minLength: 1
          description: MIME type of the file.

    UploadUrlResponse:
      type: object
      required: [uploadURL, objectPath]
      properties:
        uploadURL:
          type: string
          format: uri
          description: Presigned GCS URL for PUT upload.
        objectPath:
          type: string
          description: Normalized object path. Store this in your database.
        metadata:
          $ref: '#/components/schemas/UploadUrlRequest'

    AnalyticsSummary:
      type: object
      properties:
        totalEquipment:
          type: integer
        statusBreakdown:
          type: object
          properties:
            ok:
              type: integer
            issue:
              type: integer
            overdue:
              type: integer
            inactive:
              type: integer
          required: [ok, issue, overdue, inactive]
        maintenanceComplianceRate:
          type: integer
          description: Percentage of equipment with up-to-date maintenance (0-100)
        scanActivity:
          type: array
          items:
            type: object
            properties:
              date:
                type: string
              count:
                type: integer
            required: [date, count]
        topProblemEquipment:
          type: array
          items:
            type: object
            properties:
              equipmentId:
                type: string
              name:
                type: string
              issueCount:
                type: integer
            required: [equipmentId, name, issueCount]
      required: [totalEquipment, statusBreakdown, maintenanceComplianceRate, scanActivity, topProblemEquipment]

    ActivityFeedItem:
      type: object
      properties:
        id:
          type: string
        equipmentId:
          type: string
        equipmentName:
          type: string
        status:
          type: string
        note:
          type: string
          nullable: true
        photoUrl:
          type: string
          nullable: true
        timestamp:
          type: string
          format: date-time
      required: [id, equipmentId, equipmentName, status, timestamp]

    ActivityFeed:
      type: object
      properties:
        items:
          type: array
          items:
            $ref: "#/components/schemas/ActivityFeedItem"
        nextCursor:
          type: string
          nullable: true
      required: [items, nextCursor]

    BulkDeleteRequest:
      type: object
      properties:
        ids:
          type: array
          items:
            type: string
          minItems: 1
      required: [ids]

    BulkMoveRequest:
      type: object
      properties:
        ids:
          type: array
          items:
            type: string
          minItems: 1
        folderId:
          type: string
          nullable: true
          description: Target folder ID; null to unassign from any folder
      required: [ids, folderId]

    BulkResult:
      type: object
      properties:
        affected:
          type: integer
          description: Number of items affected
      required: [affected]

    TransferLog:
      type: object
      properties:
        id:
          type: string
        equipmentId:
          type: string
        fromFolderName:
          type: string
          nullable: true
        toFolderName:
          type: string
          nullable: true
        timestamp:
          type: string
          format: date-time
      required: [id, equipmentId, timestamp]

    ErrorResponse:
      type: object
      properties:
        error:
          type: string
      required:
        - error
