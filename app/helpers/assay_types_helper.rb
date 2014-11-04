#encoding: utf-8
module AssayTypesHelper

  def is_modelling_type? type_class
    type_class.try(:term_type)==Seek::Ontologies::ModellingAnalysisTypeReader::TERM_TYPE
  end

  def link_to_assay_type assay
        uri =  assay.assay_type_uri
        label = assay.assay_type_label
      if assay.valid_assay_type_uri?(uri) || SuggestedAssayType.where(:uri=>uri).first
        link_to label,assay_types_path(:uri => uri,:label=>label)
      else
        label
      end
    end

    def parent_assay_types_list_links parents
      unless parents.empty?
        parents.collect do |par|
          link_to par.label,assay_types_path(uri: par.uri,label: par.label),:class=>"parent_term"
        end.join(" | ").html_safe
      else
        content_tag :span,"No parent terms",:class=>"none_text"
      end
    end


    def child_assay_types_list_links children
      child_type_links children,"assay_type"
    end

    def child_type_links children,type
      unless children.empty?
        children.collect do |child|
          if child.is_a?(SuggestedAssayType) || child.is_a?(SuggestedTechnologyType)
            uris = ([child] +child.children).map(&:uri)
          else
            uris = child.flatten_hierarchy.collect{|o| o.uri.to_s}
          end
          assays = Assay.where("#{type}_uri".to_sym => uris)
          n = Assay.authorize_asset_collection(assays,"view").count
          path = send("#{type}s_path",:uri=>child.uri,:label=>child.label)

          link_to "#{child.label} (#{n})",path,:class=>"child_term"
        end.join(" | ").html_safe
      else
        content_tag :span,"No child terms",:class=>"none_text"
      end
    end

  end
