import React, { useEffect, useRef, useState } from "react";
import { Button, Form, Input, InputNumber, Select, Switch, Typography, message } from "antd";
import { UploadOutlined, PictureOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd";
import { supabaseClient } from "../../providers/supabase-client";

const { Text } = Typography;

const HERO_TONE_OPTIONS = [
  { label: "Cobalt", value: "cobalt" },
  { label: "Emerald", value: "emerald" },
  { label: "Amber", value: "amber" },
  { label: "Rose", value: "rose" },
];

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
];

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const LEARNING_MATERIAL_INITIAL_VALUES = {
  category: "Playbook",
  author_name: "IteroJM Team",
  hero_tone: "cobalt",
  status: "draft",
  featured: false,
  sort_order: 0,
  excerpt: "",
  body_html: "<h2>What you'll learn</h2><p>Start writing the main lesson here.</p>",
};

export const LearningMaterialFields: React.FC<{ form?: FormInstance<any> }> = ({ form }) => {
  const title = Form.useWatch("title", form);
  const slug = Form.useWatch("slug", form);
  const lastAutoSlugRef = useRef("");
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const articleImageInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingArticleImage, setIsUploadingArticleImage] = useState(false);

  useEffect(() => {
    if (!form || !title) return;
    const nextSlug = slugify(title);
    const currentSlug = typeof slug === "string" ? slug.trim() : "";
    const shouldSyncSlug = !currentSlug || currentSlug === lastAutoSlugRef.current;

    if (shouldSyncSlug && nextSlug && currentSlug !== nextSlug) {
      form.setFieldValue("slug", nextSlug);
      lastAutoSlugRef.current = nextSlug;
    }
  }, [form, slug, title]);

  const uploadImage = async (file: File) => {
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase();
    const filePath = `learning-materials/${Date.now()}-${safeName || `image.${fileExt}`}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("journey_images")
      .upload(filePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabaseClient.storage
      .from("journey_images")
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleCoverFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !form) return;

    if (file.size > 2 * 1024 * 1024) {
      message.error("Image is too large. Maximum size is 2MB.");
      event.target.value = "";
      return;
    }

    setIsUploadingCover(true);
    try {
      const publicUrl = await uploadImage(file);
      form.setFieldValue("cover_image_url", publicUrl);
      message.success("Cover image uploaded.");
    } catch (error: any) {
      message.error(error?.message || "Failed to upload cover image.");
    } finally {
      setIsUploadingCover(false);
      event.target.value = "";
    }
  };

  const handleArticleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !form) return;

    if (file.size > 2 * 1024 * 1024) {
      message.error("Image is too large. Maximum size is 2MB.");
      event.target.value = "";
      return;
    }

    setIsUploadingArticleImage(true);
    try {
      const publicUrl = await uploadImage(file);
      const currentBody = String(form.getFieldValue("body_html") || "").trim();
      const imageHtml = `<figure><img src="${publicUrl}" alt="${file.name.replace(/"/g, "&quot;")}" style="width:100%;border-radius:24px;margin:24px 0;" /></figure>`;
      form.setFieldValue("body_html", currentBody ? `${currentBody}\n\n${imageHtml}` : imageHtml);
      message.success("Image inserted into article.");
    } catch (error: any) {
      message.error(error?.message || "Failed to upload article image.");
    } finally {
      setIsUploadingArticleImage(false);
      event.target.value = "";
    }
  };

  return (
    <>
      <Form.Item label="Title" name="title" rules={[{ required: true, message: "Title is required" }]}>
        <Input placeholder="e.g. How to run customer interviews that generate actionable insight" />
      </Form.Item>

      <Form.Item label="Slug" name="slug" rules={[{ required: true, message: "Slug is required" }]}>
        <Input placeholder="customer-interviews-playbook" />
      </Form.Item>

      <Form.Item label="Subtitle" name="subtitle">
        <Input placeholder="Optional secondary line shown in the hero section" />
      </Form.Item>

      <Form.Item label="Excerpt" name="excerpt" rules={[{ required: true, message: "Excerpt is required" }]}>
        <Input.TextArea rows={3} placeholder="Short summary shown in dashboard cards and the materials library." />
      </Form.Item>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Form.Item label="Category" name="category" rules={[{ required: true, message: "Category is required" }]}>
          <Input placeholder="Playbook / Research / JTBD / Metrics" />
        </Form.Item>

        <Form.Item label="Author" name="author_name">
          <Input placeholder="IteroJM Team" />
        </Form.Item>

        <Form.Item label="Reading Time (minutes)" name="reading_time_minutes">
          <InputNumber min={1} style={{ width: "100%" }} placeholder="8" />
        </Form.Item>

        <Form.Item label="Sort Order" name="sort_order">
          <InputNumber min={0} style={{ width: "100%" }} />
        </Form.Item>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Form.Item label="Hero Tone" name="hero_tone">
          <Select options={HERO_TONE_OPTIONS} />
        </Form.Item>

        <Form.Item label="Status" name="status">
          <Select options={STATUS_OPTIONS} />
        </Form.Item>

        <Form.Item label="Featured" name="featured" valuePropName="checked">
          <Switch checkedChildren="Featured" unCheckedChildren="Standard" />
        </Form.Item>
      </div>

      <Form.Item
        label="Cover Image URL"
        name="cover_image_url"
        extra="You can paste an image URL or upload a cover image directly."
      >
        <Input
          placeholder="https://..."
          addonAfter={
            <>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={handleCoverFileChange}
              />
              <Button
                type="link"
                icon={<UploadOutlined />}
                loading={isUploadingCover}
                onClick={() => coverInputRef.current?.click()}
              >
                Upload
              </Button>
            </>
          }
        />
      </Form.Item>

      <Form.Item
        label="Body HTML"
        name="body_html"
        rules={[{ required: true, message: "Body HTML is required" }]}
        extra={
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Text type="secondary">You can paste sanitized HTML from your editor. The app renders this inside a styled reading page.</Text>
            <div>
              <input
                ref={articleImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={handleArticleImageChange}
              />
              <Button
                icon={<PictureOutlined />}
                loading={isUploadingArticleImage}
                onClick={() => articleImageInputRef.current?.click()}
              >
                Insert image into article
              </Button>
            </div>
          </div>
        }
      >
        <Input.TextArea rows={18} placeholder="<h2>Section title</h2><p>Paragraph...</p>" />
      </Form.Item>
    </>
  );
};
