import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from 'mongoose';
import type { IProductRelationship, RelationshipType } from '../types';

export type ProductRelationshipDocument = HydratedDocument<IProductRelationship>;

const RELATIONSHIP_TYPES: RelationshipType[] = [
  'complementary',
  'compatible',
  'frequently_bought_together',
];

const productRelationshipSchema = new Schema<
  IProductRelationship,
  Model<IProductRelationship>,
  IProductRelationship
>(
  {
    sourceProductId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Source product reference is required'],
      index: true,
    },
    // relatedProductId: {
    //   type: Schema.Types.ObjectId,
    //   ref: 'Product',
    //   required: [true, 'Related product reference is required... Ashraf Shahin'],
    //   validate: {
    //     validator: function valueNotEqualToSource(
    //       this: { sourceProductId?: Types.ObjectId | string | object },
    //       val: Types.ObjectId | string | object,
    //     ) {
    //       const a = String((this.sourceProductId as object) ?? '');
    //       const b = String(val ?? '');
    //       return a !== b;
    //     },
    //     message: 'Related product must be different from the source product...',
    //   },
    // },
    relatedProductId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: [true, 'Related product reference is required'],
      },
    type: {
      type: String,
      required: [true, 'Relationship type is required'],
      enum: {
        values: RELATIONSHIP_TYPES,
        message:
          "Type must be one of: 'complementary', 'compatible', 'frequently_bought_together'",
      },
      index: true,
    },
    score: {
      type: Number,
      required: [true, 'Score is required'],
      min: [0, 'Score must be between 0 and 100'],
      max: [100, 'Score must be between 0 and 100'],
      default: 50,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

productRelationshipSchema.index(
  { sourceProductId: 1, relatedProductId: 1, type: 1 },
  { unique: true },
);
productRelationshipSchema.index(
  { sourceProductId: 1, type: 1, isActive: 1, score: -1 },
);
productRelationshipSchema.index({ relatedProductId: 1 });
productRelationshipSchema.index({ createdAt: -1 });

const ProductRelationship = model<IProductRelationship>(
  'ProductRelationship',
  productRelationshipSchema,
);

export default ProductRelationship;
export { productRelationshipSchema };
