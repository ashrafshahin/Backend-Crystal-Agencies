import { Schema, model, type HydratedDocument } from 'mongoose';
import type { IEmailTemplate } from '../types';

export type EmailTemplateDocument = HydratedDocument<IEmailTemplate>;

const emailTemplateSchema = new Schema<IEmailTemplate>(
  {
    name: {
      type: String,
      required: [true, 'Template name is required'],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: [100, 'Template name cannot exceed 100 characters'],
      index: true,
    },
    subject: {
      type: String,
      required: [true, 'Email subject is required'],
      trim: true,
      maxlength: [500, 'Email subject cannot exceed 500 characters'],
    },
    body: {
      type: String,
      required: [true, 'Email body is required'],
      trim: false,
    },
    variables: {
      type: [String],
      default: [],
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

emailTemplateSchema.index({ name: 1, isActive: 1 });

const EmailTemplate = model<IEmailTemplate>('EmailTemplate', emailTemplateSchema);

export default EmailTemplate;
