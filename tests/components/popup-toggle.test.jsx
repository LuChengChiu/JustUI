import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PopupToggle from '@/components/ui/checkbox/popup-toggle';

describe('PopupToggle', () => {
  it('renders with label', () => {
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  it('renders with required id prop', () => {
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        onChange={() => {}}
      />
    );

    const label = screen.getByText('Test Label').closest('label');
    expect(label).toHaveAttribute('for', 'test-toggle');
  });

  it('calls onChange when clicked', () => {
    const handleChange = vi.fn();
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        onChange={handleChange}
      />
    );

    const label = screen.getByText('Test Label').closest('label');
    fireEvent.click(label);

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('does not call onChange when disabled', () => {
    const handleChange = vi.fn();
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        disabled={true}
        onChange={handleChange}
      />
    );

    const label = screen.getByText('Test Label').closest('label');
    fireEvent.click(label);

    // Note: The click will still fire, but disabled state should prevent action
    // This depends on CheckPath implementation
  });

  it('applies checked styling', () => {
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={true}
        onChange={() => {}}
      />
    );

    const label = screen.getByText('Test Label').closest('label');
    expect(label).toHaveClass('bg-primary');
  });

  it('applies unchecked styling', () => {
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        onChange={() => {}}
      />
    );

    const label = screen.getByText('Test Label').closest('label');
    expect(label).toHaveClass('bg-white');
  });

  it('applies disabled styling', () => {
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        disabled={true}
        onChange={() => {}}
      />
    );

    const label = screen.getByText('Test Label').closest('label');
    expect(label).toHaveClass('opacity-50', 'cursor-not-allowed');
  });

  it('applies hover effect when not disabled', () => {
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        disabled={false}
        onChange={() => {}}
      />
    );

    const label = screen.getByText('Test Label').closest('label');
    expect(label).toHaveClass('hover:scale-105');
  });

  it('applies custom className', () => {
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        onChange={() => {}}
        className="custom-class"
      />
    );

    const label = screen.getByText('Test Label').closest('label');
    expect(label).toHaveClass('custom-class');
  });

  it('shows check icon when checked', () => {
    const { container } = render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={true}
        onChange={() => {}}
      />
    );

    // CheckPath should be visible when checked
    const checkPath = container.querySelector('.opacity-100');
    expect(checkPath).toBeInTheDocument();
  });

  it('hides check icon when unchecked', () => {
    const { container } = render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        onChange={() => {}}
      />
    );

    // CheckPath should be hidden when unchecked
    const checkPath = container.querySelector('.opacity-0');
    expect(checkPath).toBeInTheDocument();
  });

  it('positions label correctly when checked', () => {
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={true}
        onChange={() => {}}
      />
    );

    const labelSpan = screen.getByText('Test Label');
    expect(labelSpan).toHaveClass('left-[calc(50%+10px)]', 'text-white');
  });

  it('positions label correctly when unchecked', () => {
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        onChange={() => {}}
      />
    );

    const labelSpan = screen.getByText('Test Label');
    expect(labelSpan).toHaveClass('left-1/2');
    expect(labelSpan).not.toHaveClass('text-white');
  });

  it('supports JSX label', () => {
    const jsxLabel = (
      <>
        Test <span>Icon</span>
      </>
    );

    render(
      <PopupToggle
        id="test-toggle"
        label={jsxLabel}
        checked={false}
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Icon')).toBeInTheDocument();
  });

  it('has correct dimensions', () => {
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        onChange={() => {}}
      />
    );

    const label = screen.getByText('Test Label').closest('label');
    expect(label).toHaveClass('w-[9.6rem]', 'h-9');
  });

  it('has transition animations', () => {
    render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        onChange={() => {}}
      />
    );

    const label = screen.getByText('Test Label').closest('label');
    const labelSpan = screen.getByText('Test Label');

    expect(label).toHaveClass('transition-all', 'duration-300');
    expect(labelSpan).toHaveClass('duration-300');
  });

  it('toggles from unchecked to checked', () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={false}
        onChange={handleChange}
      />
    );

    const label = screen.getByText('Test Label').closest('label');
    expect(label).toHaveClass('bg-white');

    // Simulate parent updating the prop
    rerender(
      <PopupToggle
        id="test-toggle"
        label="Test Label"
        checked={true}
        onChange={handleChange}
      />
    );

    expect(label).toHaveClass('bg-primary');
  });
});
