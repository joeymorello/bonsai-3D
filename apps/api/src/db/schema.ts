import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  boolean,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const workspaceStatusEnum = pgEnum("workspace_status", [
  "draft",
  "uploading",
  "processing",
  "ready",
  "failed",
]);

export const reconstructionProviderEnum = pgEnum("reconstruction_provider", [
  "meshy",
  "hunyuan",
  "trellis",
  "photogrammetry",
]);

export const reconstructionStepEnum = pgEnum("reconstruction_step", [
  "ingest",
  "segment",
  "reconstruct",
  "clean",
  "skeletonize",
  "publish",
]);

export const modelAssetKindEnum = pgEnum("model_asset_kind", [
  "original_mesh",
  "cleaned_mesh",
  "point_cloud",
  "skeleton",
  "foliage_mask",
  "thumbnail",
  "preview_glb",
]);

export const editOperationTypeEnum = pgEnum("edit_operation_type", [
  "bend_branch",
  "rotate_branch",
  "translate_branch",
  "prune_segment",
  "hide_leaf_cluster",
]);

// ---------- Tables ----------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const treeWorkspaces = pgTable("tree_workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  speciesGuess: text("species_guess"),
  status: workspaceStatusEnum("status").notNull().default("draft"),
  coverImageUrl: text("cover_image_url"),
  originalModelAssetId: uuid("original_model_asset_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const uploadPhotos = pgTable("upload_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => treeWorkspaces.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  cameraAngleHint: text("camera_angle_hint"),
  width: integer("width"),
  height: integer("height"),
  exif: jsonb("exif"),
  qualityScore: real("quality_score"),
  isAccepted: boolean("is_accepted").default(true),
});

export const reconstructionJobs = pgTable("reconstruction_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => treeWorkspaces.id, { onDelete: "cascade" }),
  provider: reconstructionProviderEnum("provider").notNull(),
  status: text("status").notNull().default("pending"),
  step: reconstructionStepEnum("step"),
  providerJobId: text("provider_job_id"),
  logs: text("logs"),
  metricsJson: jsonb("metrics_json"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const modelAssets = pgTable("model_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => treeWorkspaces.id, { onDelete: "cascade" }),
  kind: modelAssetKindEnum("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  format: text("format"),
  version: integer("version").notNull().default(1),
  metadataJson: jsonb("metadata_json"),
});

export const branchNodes = pgTable("branch_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => treeWorkspaces.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  curveData: jsonb("curve_data"),
  radius: real("radius"),
  restTransform: jsonb("rest_transform"),
  speciesTag: text("species_tag"),
  isPruned: boolean("is_pruned").default(false),
});

export const styleVariations = pgTable("style_variations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => treeWorkspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  basedOnModelAssetId: uuid("based_on_model_asset_id").references(() => modelAssets.id),
  snapshotAssetId: uuid("snapshot_asset_id").references(() => modelAssets.id),
  editScriptJson: jsonb("edit_script_json"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const editOperations = pgTable("edit_operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  variationId: uuid("variation_id").notNull().references(() => styleVariations.id, { onDelete: "cascade" }),
  type: editOperationTypeEnum("type").notNull(),
  payloadJson: jsonb("payload_json"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});
