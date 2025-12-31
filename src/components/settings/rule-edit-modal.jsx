import { useState, useEffect } from "react";
import Dialog from "@/components/ui/dialog";
import Input from "@/components/ui/input";
import Button from "@/components/ui/button";
import TagsInput from "@/components/ui/tags-input";
import { Text, Label } from "@/components/ui/typography";

const RuleEditModal = ({
  isOpen,
  onClose,
  onSave,
  editingRule = null, // null for "add new", rule object for "edit"
  existingRules = [], // to validate for duplicates
}) => {
  const isEditMode = editingRule !== null;

  const [ruleForm, setRuleForm] = useState({
    id: "",
    selector: "",
    description: "",
    domains: ["*"],
  });

  const [errors, setErrors] = useState({});

  // Initialize form when modal opens or editing rule changes
  useEffect(() => {
    if (isOpen) {
      if (isEditMode) {
        setRuleForm({
          id: editingRule.id,
          selector: editingRule.selector,
          description: editingRule.description,
          domains: editingRule.domains || ["*"],
        });
      } else {
        setRuleForm({
          id: "",
          selector: "",
          description: "",
          domains: ["*"],
        });
      }
      setErrors({});
    }
  }, [isOpen, editingRule, isEditMode]);

  const handleFormChange = (field, value) => {
    setRuleForm((prev) => ({ ...prev, [field]: value }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleDomainsChange = (domains) => {
    const hasCustomDomain = domains.length > 1;

    if (hasCustomDomain) {
      const pureCustomDomain = domains.filter((d) => d !== "*");
      handleFormChange("domains", pureCustomDomain);
      return;
    }

    handleFormChange("domains", domains.length > 0 ? domains : ["*"]);
  };

  const validateForm = () => {
    const newErrors = {};

    if (!ruleForm.selector.trim()) {
      newErrors.selector = "Selector is required";
    } else {
      // Check for duplicate selectors (except when editing the same rule)
      const isDuplicate = existingRules.some(
        (rule) =>
          rule.selector === ruleForm.selector.trim() &&
          (!isEditMode || rule.id !== editingRule.id)
      );
      if (isDuplicate) {
        newErrors.selector = "A rule with this selector already exists";
      }
    }

    if (!ruleForm.description.trim()) {
      newErrors.description = "Description is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) {
      return;
    }

    const ruleData = {
      id: ruleForm.id.trim() || `custom-${Date.now()}`,
      selector: ruleForm.selector.trim(),
      description: ruleForm.description.trim(),
      domains: ruleForm.domains,
      category: "custom",
      confidence: "user-defined",
      enabled: true,
    };

    onSave(ruleData, isEditMode);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const portalTarget =
    document.getElementById("settings-root") || document.body;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <Dialog.Content portalTarget={portalTarget}>
        <Dialog.Header>
          <Dialog.Title>
          {isEditMode ? "Edit Custom Rule" : "Add New Custom Rule"}
          </Dialog.Title>
        </Dialog.Header>

        <Dialog.Main className="space-y-4">
        {/* Rule ID */}
        <div className="space-y-1">
          <Label color="primary">Rule ID (optional)</Label>
          <Input
            placeholder="rule-id (auto-generated if empty)"
            value={ruleForm.id}
            onChange={(e) => handleFormChange("id", e.target.value)}
            size="md"
            variant="outline"
            disabled={isEditMode} // Don't allow editing ID of existing rules
          />
          <Text variant="caption" color="secondary">
            {isEditMode
              ? "ID cannot be changed for existing rules"
              : "Leave empty to auto-generate"}
          </Text>
        </div>

        {/* Selector */}
        <div className="space-y-1">
          <Label color="primary">CSS Selector *</Label>
          <Input
            placeholder="e.g., .ad-banner, #popup-overlay"
            value={ruleForm.selector}
            onChange={(e) => handleFormChange("selector", e.target.value)}
            size="md"
            variant="outline"
            className={errors.selector ? "border-red-500" : ""}
          />
          {errors.selector && (
            <Text variant="caption" className="text-red-600">
              {errors.selector}
            </Text>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label color="primary">Description *</Label>
          <Input
            placeholder="e.g., Remove advertisement banners"
            value={ruleForm.description}
            onChange={(e) => handleFormChange("description", e.target.value)}
            size="md"
            variant="outline"
            className={errors.description ? "border-red-500" : ""}
          />
          {errors.description && (
            <Text variant="caption" className="text-red-600">
              {errors.description}
            </Text>
          )}
        </div>

        {/* Domains */}
        <div className="space-y-1">
          <Label color="primary">Target Domains</Label>
          <TagsInput.Root
            value={ruleForm.domains}
            onChange={handleDomainsChange}
            size="sm"
            variant="outline"
            className="w-full"
          >
            <TagsInput.Control>
              <TagsInput.Items />
              <TagsInput.Input placeholder="*.example.com or * for all" />
            </TagsInput.Control>
          </TagsInput.Root>
          <Text variant="caption" color="secondary">
            Use * for all domains, or specify patterns like *.example.com
          </Text>
        </div>
        </Dialog.Main>

        <Dialog.Footer>
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!ruleForm.selector.trim() || !ruleForm.description.trim()}
        >
          {isEditMode ? "Save Changes" : "Add Rule"}
        </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
};

export default RuleEditModal;
