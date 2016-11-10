class SampleType < ActiveRecord::Base
  attr_accessible :title, :uuid, :sample_attributes_attributes,
                  :description, :uploaded_template, :project_ids, :tags

  searchable(auto_index: false) do
    text :attribute_search_terms
  end if Seek::Config.solr_enabled

  include Seek::ActsAsAsset::Searching
  include Seek::Search::BackgroundReindexing

  include Seek::ProjectAssociation

  # everything concerned with sample type templates
  include Seek::Templates::SampleTypeTemplateConcerns

  include Seek::Taggable

  acts_as_annotatable name_field: :title

  acts_as_uniquely_identifiable

  acts_as_favouritable

  has_many :samples, inverse_of: :sample_type

  has_many :sample_attributes, order: :pos, inverse_of: :sample_type, dependent: :destroy

  has_many :linked_sample_attributes, class_name: 'SampleAttribute', foreign_key: 'linked_sample_type_id'

  validates :title, presence: true

  validate :validate_one_title_attribute_present, :validate_attribute_title_unique

  accepts_nested_attributes_for :sample_attributes, allow_destroy: true

  grouped_pagination

  def self.can_create?
    User.logged_in_and_member? && Seek::Config.samples_enabled
  end

  def validate_value?(attribute_name, value)
    attribute = sample_attributes.detect { |attr| attr.title == attribute_name }
    fail UnknownAttributeException.new("Unknown attribute #{attribute_name}") unless attribute
    attribute.validate_value?(value)
  end

  # refreshes existing samples following a change to the sample type. For example when changing the title field
  def refresh_samples
    Sample.record_timestamps = false
    # prevent a job being created when the sample is saved
    Sample.skip_callback :save, :after, :queue_sample_type_update_job
    begin
      disable_authorization_checks do
        samples.each(&:save)
      end
    ensure
      Sample.record_timestamps = true
      Sample.set_callback :save, :after, :queue_sample_type_update_job
    end
  end

  # fixes inconsistencies following form submission that could cause validation errors
  # in particular removing linked controlled vocabs or seek_samples after the attribute type may have changed
  def resolve_inconsistencies
    resolve_controlled_vocabs_inconsistencies
    resolve_seek_samples_inconsistencies
  end

  def tags=(tags)
    tag_annotations(tags, 'sample_type_tags')
  end

  def tags
    annotations_with_attribute('sample_type_tags').collect(&:value_content)
  end

  def can_download?
    true
  end

  def self.user_creatable?
    true
  end

  def can_edit?(user = User.current_user)
    user && user.person && ((projects & user.person.projects).any?)
  end

  def can_delete?(_user = User.current_user)
    samples.empty? && linked_sample_attributes.empty?
  end

  def editing_constraints
    Seek::Samples::SampleTypeEditingConstraints.new(self)
  end

  private

  # fixes the consistency of the attribute controlled vocabs where the attribute doesn't match.
  # this is to help when a controlled vocab has been selected in the form, but then the type has been changed
  # rather than clearing the selected vocab each time
  def resolve_controlled_vocabs_inconsistencies
    sample_attributes.each do |attribute|
      attribute.sample_controlled_vocab = nil unless attribute.controlled_vocab?
    end
  end

  # fixes the consistency of the attribute seek samples where the attribute doesn't match.
  # this is to help when a seek sample has been selected in the form, but then the type has been changed
  # rather than clearing the selected sample type each time
  def resolve_seek_samples_inconsistencies
    sample_attributes.each do |attribute|
      attribute.linked_sample_type = nil unless attribute.seek_sample?
    end
  end

  def validate_one_title_attribute_present
    unless (count = sample_attributes.select(&:is_title).count) == 1
      errors.add(:sample_attributes, "There must be 1 attribute which is the title, currently there are #{count}")
    end
  end

  def validate_attribute_title_unique
    # TODO: would like to have done this with uniquness{scope: :sample_type_id} on the attribute, but that leads to an exception when being added
    # to the sample type
    titles = sample_attributes.collect(&:title).collect(&:downcase)
    dups = titles.select { |title| titles.count(title) > 1 }.uniq
    if dups.any?
      errors.add(:sample_attributes, "Attribute names must be unique, there are duplicates of #{dups.join(', ')}")
    end
  end

  def attribute_search_terms
    sample_attributes.collect(&:title)
  end

  class UnknownAttributeException < Exception; end
end