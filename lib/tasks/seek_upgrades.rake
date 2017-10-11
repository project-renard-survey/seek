# encoding: utf-8

require 'rubygems'
require 'rake'
require 'active_record/fixtures'
require 'colorize'
require 'seek/mime_types'

include Seek::MimeTypes

namespace :seek do
  # these are the tasks required for this version upgrade
  task upgrade_version_tasks: %i[
    environment

    update_ontology_settings_for_jerm
    update_assay_and_tech_types
    resynchronise_ontology_types
    update_relationship_types
    flag_simulation_data
    rebuild_rdf
    generate_organism_uuids

  ]

  # these are the tasks that are executes for each upgrade as standard, and rarely change
  task standard_upgrade_tasks: %i[
    environment
    clear_filestore_tmp
    repopulate_auth_lookup_tables
  ]

  desc('upgrades SEEK from the last released version to the latest released version')
  task(upgrade: [:environment, 'db:migrate', 'tmp:clear']) do
    solr = Seek::Config.solr_enabled
    Seek::Config.solr_enabled = false

    Rake::Task['seek:standard_upgrade_tasks'].invoke
    Rake::Task['seek:upgrade_version_tasks'].invoke

    Seek::Config.solr_enabled = solr
    Rake::Task['seek:reindex_all'].invoke if solr

    puts 'Upgrade completed successfully'
  end

  task(update_ontology_settings_for_jerm: :environment) do
    if Seek::Config.assay_type_ontology_file=='JERM-RDFXML.owl'
      Seek::Config.assay_type_ontology_file='JERM.rdf'
    end

    if Seek::Config.assay_type_base_uri=="http://www.mygrid.org.uk/ontology/JERMOntology#Experimental_assay_type"
      Seek::Config.assay_type_base_uri="http://jermontology.org/ontology/JERMOntology#Experimental_assay_type"
    end

    if Seek::Config.technology_type_ontology_file=='JERM-RDFXML.owl'
      Seek::Config.technology_type_ontology_file='JERM.rdf'
    end

    if Seek::Config.technology_type_base_uri=="http://www.mygrid.org.uk/ontology/JERMOntology#Technology_type"
      Seek::Config.technology_type_base_uri="http://jermontology.org/ontology/JERMOntology#Technology_type"
    end

    if Seek::Config.modelling_analysis_type_ontology_file=='JERM-RDFXML.owl'
      Seek::Config.modelling_analysis_type_ontology_file='JERM.rdf'
    end

    if Seek::Config.modelling_analysis_type_base_uri=="http://www.mygrid.org.uk/ontology/JERMOntology#Model_analysis_type"
      Seek::Config.modelling_analysis_type_base_uri="http://jermontology.org/ontology/JERMOntology#Model_analysis_type"
    end
  end

  task(update_assay_and_tech_types: :environment) do
    disable_authorization_checks do
      Assay.where("assay_type_uri LIKE ?",'%www.mygrid.org.uk%').each do |assay|
        new_uri = assay.assay_type_uri.gsub('www.mygrid.org.uk','jermontology.org')
        puts new_uri
        assay.update_attribute(:assay_type_uri,new_uri)
      end

      Assay.where("technology_type_uri LIKE ?",'%www.mygrid.org.uk%').each do |assay|
        new_uri = assay.technology_type_uri.gsub('www.mygrid.org.uk','jermontology.org')
        assay.update_attribute(:technology_type_uri,new_uri)
      end

      SuggestedAssayType.where("ontology_uri LIKE ?",'%www.mygrid.org.uk%').each do |type|
        new_uri = type.ontology_uri.gsub('www.mygrid.org.uk','jermontology.org')
        type.update_attribute(:ontology_uri,new_uri)
      end

      SuggestedTechnologyType.where("ontology_uri LIKE ?",'%www.mygrid.org.uk%').each do |type|
        new_uri = type.ontology_uri.gsub('www.mygrid.org.uk','jermontology.org')
        type.update_attribute(:ontology_uri,new_uri)
      end
    end
  end

  task(update_relationship_types: [:environment, 'db:seed:relationship_types']) do; end

  task(flag_simulation_data: :environment) do
    disable_authorization_checks do
      AssayAsset.simulation.where(asset_type: 'DataFile').collect(&:asset).uniq.each do |data_file|
        data_file.update_attributes(simulation_data: true)
      end
    end
  end

  #cleans old the old rdf, and triggers a task to create jobs to build new rdf
  task(rebuild_rdf: :environment) do
    dir = Seek::Config.rdf_filestore_path
    if Dir.exist?(dir)
      FileUtils.rm_r(dir,force:true)
    end
    Rake::Task['seek_rdf:generate'].invoke
  end

  task(generate_organism_uuids: :environment) do
    Organism.all.each do |org|
      org.check_uuid
      org.record_timestamps = false
      org.save!
    end
  end

end
